"""Hometide as an Alexa skill: the stand-in for an Alexa+ add-on.

Amazon's Alexa+ MCP Toolkit isn't open to hackathon entrants, so the Hometide MCP server (built to the add-on
spec) is reached through an ordinary Alexa Skills Kit skill instead:

    Fire TV remote -> Alexa (speech) -> this endpoint -> Bedrock tool loop -> Hometide MCP server (over HTTP)

The skill uses standard account linking with Amazon Cognito (OAuth authorization code grant), the same sign-in an
Alexa+ add-on uses. Each request carries the family's linked access token, which this endpoint passes to the MCP
server as a bearer token, exactly as an add-on host would.

Requests are accepted only if they are signed by Amazon for this skill (Amazon's rules for skills hosted outside
AWS Lambda): the signing certificate comes from Amazon's S3 path, chains to a trusted root, and names
echo-api.amazon.com; the body's Signature-256 matches; the timestamp is within 150 seconds; and the skill ID matches.
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import posixpath
import re
import time
import warnings
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncIterator, Callable
from urllib.parse import urlparse

import certifi
import httpx
from cryptography import x509
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.x509.verification import DNSName, PolicyBuilder, Store, VerificationError
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client
from mcp.server.fastmcp.exceptions import ToolError

from .voice import ToolAccess

logger = logging.getLogger("familyos.agent.alexa")

CERT_HOST = "s3.amazonaws.com"
CERT_PATH = "/echo.api/"
ALEXA_NAME = "echo-api.amazon.com"
MAX_SKEW_SECONDS = 150
ANSWER_SECONDS = 7.0  # Alexa gives a skill about 8 seconds.

# Each custom intent carries the rest of the sentence in one AMAZON.SearchQuery slot named "request".
# Alexa drops the carrier word, so the intent tells us how to put the sentence back together.
INTENT_PREFIX = {
    "OpenIntent": "open", "ShowIntent": "show", "WhatIntent": "what's", "WhoIntent": "who's", "WhenIntent": "when is",
    "HowManyIntent": "how many", "IsIntent": "is", "AnyIntent": "any", "SwapIntent": "swap", "MoveIntent": "move",
    "AddIntent": "add", "DoneIntent": "I finished", "TellIntent": "tell me",
}
WELCOME = "Hometide here. You can say: open the calendar, what's on today, or what's the weather."
HELP = ("Try: open the calendar, show the wall calendar, what's on today, who's picking up Emma, "
        "what's the weather, or swap Emma's pickup to Alex. Changes wait for a parent to confirm on the TV.")


class AlexaRequestRejected(Exception):
    """The request isn't a genuine, current Alexa request for this skill."""


# Verifying the request ---------------------------------------------------------------------------------

def _trust_store() -> Store:
    roots = []
    for block in re.findall(rb"-----BEGIN CERTIFICATE-----.+?-----END CERTIFICATE-----", Path(certifi.where()).read_bytes(), re.S):
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")  # A few old roots have non-standard serial numbers.
                roots.append(x509.load_pem_x509_certificate(block))
        except ValueError:
            continue  # A root the parser can't read can't anchor Amazon's chain either.
    return Store(roots)


_store: Store | None = None
_chains: dict[str, tuple[float, list[x509.Certificate]]] = {}


def check_cert_url(url: str) -> None:
    parsed = urlparse(url or "")
    path = posixpath.normpath(parsed.path) if parsed.path else ""
    try:
        port = parsed.port
    except ValueError as error:
        raise AlexaRequestRejected("bad certificate URL") from error
    if (parsed.scheme.lower() != "https" or (parsed.hostname or "").lower() != CERT_HOST
            or not path.startswith(CERT_PATH) or port not in (None, 443)):
        raise AlexaRequestRejected("certificate URL is not Amazon's")


def fetch_chain(url: str) -> list[x509.Certificate]:
    cached = _chains.get(url)
    if cached and time.monotonic() - cached[0] < 3600:
        return cached[1]
    reply = httpx.get(url, timeout=5)
    reply.raise_for_status()
    chain = x509.load_pem_x509_certificates(reply.content)
    _chains[url] = (time.monotonic(), chain)
    return chain


def verify_request(headers, body: bytes, skill_id: str, *, now: datetime | None = None,
                   fetch: Callable[[str], list[x509.Certificate]] = fetch_chain, store: Store | None = None) -> dict:
    """Return the request envelope if Amazon signed it for this skill; raise AlexaRequestRejected otherwise."""
    global _store
    current = now or datetime.now(timezone.utc)
    url = headers.get("SignatureCertChainUrl") or ""
    signature = headers.get("Signature-256") or ""
    if not url or not signature:
        raise AlexaRequestRejected("missing signature headers")
    check_cert_url(url)
    try:
        chain = fetch(url)
    except Exception as error:
        raise AlexaRequestRejected("certificate unavailable") from error
    if not chain:
        raise AlexaRequestRejected("empty certificate chain")
    if store is None:
        _store = _store or _trust_store()
        store = _store
    try:
        moment = current.astimezone(timezone.utc).replace(tzinfo=None) if current.tzinfo else current
        verifier = PolicyBuilder().store(store).time(moment).build_server_verifier(DNSName(ALEXA_NAME))
        verifier.verify(chain[0], chain[1:])
        chain[0].public_key().verify(base64.b64decode(signature), body, padding.PKCS1v15(), hashes.SHA256())
    except (VerificationError, InvalidSignature, ValueError, TypeError) as error:
        raise AlexaRequestRejected("signature or certificate check failed") from error
    try:
        envelope = json.loads(body)
        stamp = datetime.fromisoformat(str(envelope["request"]["timestamp"]).replace("Z", "+00:00"))
    except (ValueError, KeyError, TypeError) as error:
        raise AlexaRequestRejected("malformed request") from error
    if abs((current - stamp).total_seconds()) > MAX_SKEW_SECONDS:
        raise AlexaRequestRejected("stale request")
    application = (((envelope.get("context") or {}).get("System") or {}).get("application") or {}).get("applicationId") \
        or (((envelope.get("session") or {}).get("application") or {}).get("applicationId"))
    if application != skill_id:
        raise AlexaRequestRejected("request is for another skill")
    return envelope


# Reaching Hometide over MCP ----------------------------------------------------------------------------

class McpHttpTools(ToolAccess):
    """The Hometide tools through the MCP protocol, as an Alexa+ add-on host would call them."""

    def __init__(self, session: ClientSession) -> None:
        self.session = session

    async def list_tools(self) -> list[dict[str, Any]]:
        listed = await self.session.list_tools()
        return [{"name": tool.name, "description": tool.description or tool.name, "inputSchema": tool.inputSchema}
                for tool in listed.tools]

    async def call(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        result = await self.session.call_tool(name, arguments)
        text = " ".join(getattr(block, "text", "") for block in result.content or []).strip()
        if result.isError:
            raise ToolError(re.sub(r"^Error executing tool \w+: ", "", text) or "That didn't work.")
        structured = result.structuredContent
        if isinstance(structured, dict):
            return structured["result"] if set(structured) == {"result"} and isinstance(structured["result"], dict) else structured
        try:
            return json.loads(text)
        except ValueError:
            return {"speech": text}


@asynccontextmanager
async def mcp_tools(url: str, token: str, client_factory=None) -> AsyncIterator[McpHttpTools]:
    options = {"httpx_client_factory": client_factory} if client_factory else {}
    async with streamablehttp_client(url, headers={"Authorization": f"Bearer {token}"}, timeout=6, **options) as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()
            yield McpHttpTools(session)


# Answering Alexa -----------------------------------------------------------------------------------------

def speech(text: str, *, end: bool = True, reprompt: str | None = None, link_account: bool = False) -> dict:
    text = (text or "").strip()[:7000] or "Okay."
    response: dict[str, Any] = {"outputSpeech": {"type": "PlainText", "text": text}, "shouldEndSession": end}
    if reprompt:
        response["reprompt"] = {"outputSpeech": {"type": "PlainText", "text": reprompt}}
    response["card"] = {"type": "LinkAccount"} if link_account else {"type": "Simple", "title": "Hometide", "content": text}
    return {"version": "1.0", "sessionAttributes": {}, "response": response}


def utterance_for(intent: dict) -> str | None:
    prefix = INTENT_PREFIX.get(str(intent.get("name")))
    value = str((((intent.get("slots") or {}).get("request") or {}).get("value")) or "").strip()
    if prefix is None or not value:
        return None
    return f"{prefix} {value}"


async def respond(envelope: dict, *, identity_for: Callable[[str], Any], open_tools, converse,
                  budget: Callable[[str], bool]) -> dict:
    request = envelope.get("request") or {}
    kind = request.get("type")
    if kind == "SessionEndedRequest":
        return {"version": "1.0", "response": {}}
    user = ((envelope.get("context") or {}).get("System") or {}).get("user") or (envelope.get("session") or {}).get("user") or {}
    token = user.get("accessToken")
    identity = await asyncio.to_thread(identity_for, token) if token else None
    if identity is None:
        return speech("To use Hometide, open the Alexa app and link your Hometide account. I've sent a card to help.",
                      link_account=True)
    if kind == "LaunchRequest":
        return speech(WELCOME, end=False, reprompt="What would you like?")
    if kind != "IntentRequest":
        return speech("Sorry, I didn't catch that.")
    intent = request.get("intent") or {}
    name = intent.get("name")
    if name in ("AMAZON.StopIntent", "AMAZON.CancelIntent", "AMAZON.NavigateHomeIntent"):
        return speech("Okay.")
    if name == "AMAZON.HelpIntent":
        return speech(HELP, end=False, reprompt="What would you like?")
    utterance = utterance_for(intent)
    if utterance is None:
        return speech("Sorry, I didn't catch that. Try: open the calendar, or what's the weather.", end=False,
                      reprompt="What would you like?")

    async def turn() -> dict:
        async with open_tools(token) as tools:
            return await converse(utterance, tools, lambda: budget(identity.owner), ai_timeout=ANSWER_SECONDS - 1)

    try:
        result = await asyncio.wait_for(turn(), timeout=ANSWER_SECONDS)
    except asyncio.TimeoutError:
        return speech("That's taking too long. Please try again.")
    except Exception:  # Log the category only; never the token or household content.
        logger.warning("Alexa turn failed", exc_info=False)
        return speech("Sorry, Hometide isn't answering right now.")
    return speech(str(result.get("reply") or "Done."))
