"""The Alexa skill that stands in for the Alexa+ add-on: request signing, account linking, and turns over MCP."""
from __future__ import annotations

import base64
import json
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID
from cryptography.x509.verification import Store

from conftest import bearer, edit, pair_tv, parent_token
from app import alexa

SKILL = "amzn1.ask.skill.00000000-test"
CERT_URL = "https://s3.amazonaws.com/echo.api/echo-api-cert-test.pem"


# Signing -------------------------------------------------------------------------------------------------

def _chain(san: str = "echo-api.amazon.com"):
    now = datetime.now(timezone.utc)
    root_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    root_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "FamilyOS Test Root")])
    usage = dict(content_commitment=False, data_encipherment=False, key_agreement=False, encipher_only=False, decipher_only=False)
    root = (x509.CertificateBuilder().subject_name(root_name).issuer_name(root_name).public_key(root_key.public_key())
            .serial_number(x509.random_serial_number()).not_valid_before(now - timedelta(days=1))
            .not_valid_after(now + timedelta(days=30))
            .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
            .add_extension(x509.KeyUsage(digital_signature=False, key_encipherment=False, key_cert_sign=True, crl_sign=True, **usage), critical=True)
            .add_extension(x509.SubjectKeyIdentifier.from_public_key(root_key.public_key()), critical=False)
            .sign(root_key, hashes.SHA256()))
    leaf_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    leaf = (x509.CertificateBuilder().subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, san)]))
            .issuer_name(root_name).public_key(leaf_key.public_key()).serial_number(x509.random_serial_number())
            .not_valid_before(now - timedelta(days=1)).not_valid_after(now + timedelta(days=30))
            .add_extension(x509.SubjectAlternativeName([x509.DNSName(san)]), critical=False)
            .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
            .add_extension(x509.KeyUsage(digital_signature=True, key_encipherment=True, key_cert_sign=False, crl_sign=False, **usage), critical=True)
            .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]), critical=False)
            .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(root_key.public_key()), critical=False)
            .add_extension(x509.SubjectKeyIdentifier.from_public_key(leaf_key.public_key()), critical=False)
            .sign(root_key, hashes.SHA256()))
    return root, leaf, leaf_key


def _body(skill: str = SKILL, at: datetime | None = None) -> bytes:
    stamp = (at or datetime.now(timezone.utc)).strftime("%Y-%m-%dT%H:%M:%SZ")
    return json.dumps({"version": "1.0", "context": {"System": {"application": {"applicationId": skill}}},
                       "request": {"type": "LaunchRequest", "requestId": "r1", "timestamp": stamp}}).encode()


def _verify(body: bytes, *, url: str = CERT_URL, san: str = "echo-api.amazon.com", sign_body: bytes | None = None, skill: str = SKILL):
    root, leaf, key = _chain(san)
    signature = base64.b64encode(key.sign(sign_body or body, padding.PKCS1v15(), hashes.SHA256())).decode()
    headers = {"SignatureCertChainUrl": url, "Signature-256": signature}
    return alexa.verify_request(headers, body, skill, fetch=lambda _url: [leaf], store=Store([root]))


def test_a_genuine_request_passes():
    assert _verify(_body())["request"]["type"] == "LaunchRequest"


@pytest.mark.parametrize("change", ["tampered", "foreign_cert", "stale", "other_skill"])
def test_forged_or_replayed_requests_are_refused(change):
    body = _body()
    with pytest.raises(alexa.AlexaRequestRejected):
        if change == "tampered":
            _verify(body, sign_body=body.replace(b"LaunchRequest", b"IntentRequest"))
        elif change == "foreign_cert":
            _verify(body, san="evil.example.com")
        elif change == "stale":
            _verify(_body(at=datetime.now(timezone.utc) - timedelta(seconds=200)))
        else:
            _verify(body, skill="amzn1.ask.skill.someone-else")


@pytest.mark.parametrize("url", [
    "http://s3.amazonaws.com/echo.api/echo-api-cert.pem",
    "https://notamazon.com/echo.api/echo-api-cert.pem",
    "https://s3.amazonaws.com/EcHo.aPi/echo-api-cert.pem",
    "https://s3.amazonaws.com/echo.api/../invalid.pem",
    "https://s3.amazonaws.com:563/echo.api/echo-api-cert.pem",
])
def test_certificates_must_come_from_amazons_bucket(url):
    with pytest.raises(alexa.AlexaRequestRejected):
        _verify(_body(), url=url)


def test_missing_signature_headers_are_refused():
    with pytest.raises(alexa.AlexaRequestRejected):
        alexa.verify_request({}, _body(), SKILL)


# The skill end to end ------------------------------------------------------------------------------------

@pytest.fixture
def skill(api, monkeypatch):
    """The /alexa endpoint with signing checked separately, and its MCP client routed to this app in-process."""
    main = api.main
    monkeypatch.setattr(main, "ALEXA_SKILL_ID", SKILL)

    def trusted(headers, body, skill_id):
        envelope = json.loads(body)
        assert envelope["context"]["System"]["application"]["applicationId"] == skill_id
        return envelope

    monkeypatch.setattr(main.alexa, "verify_request", trusted)
    monkeypatch.setattr(main, "ALEXA_MCP_CLIENT_FACTORY",
                        lambda headers=None, timeout=None, auth=None: httpx.AsyncClient(
                            transport=httpx.ASGITransport(app=main.app), headers=headers, timeout=timeout, auth=auth))
    return api


def ask(api, kind: str = "IntentRequest", *, intent: str | None = None, request: str | None = None, token: str | None = None):
    payload = {"type": kind, "requestId": "r1", "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "locale": "en-US"}
    if intent:
        payload["intent"] = {"name": intent, "slots": {"request": {"name": "request", "value": request}} if request else {}}
    user = {"userId": "amzn1.ask.account.test", **({"accessToken": token} if token else {})}
    envelope = {"version": "1.0", "session": {"new": True, "user": user, "application": {"applicationId": SKILL}},
                "context": {"System": {"application": {"applicationId": SKILL}, "user": user}}, "request": payload}
    reply = api.client.post("/alexa", content=json.dumps(envelope), headers={"Content-Type": "application/json"})
    assert reply.status_code == 200, reply.text
    return reply.json()["response"]


def linked_token(api) -> tuple[str, str]:
    """A parent account and the token Alexa would hold after account linking."""
    parent = parent_token(api)
    voice = api.client.post("/v1/voice/connections", json={"label": "Alexa"}, headers=bearer(parent)).json()["data"]["token"]
    return parent, voice


def test_unlinked_accounts_get_a_link_card(skill):
    response = ask(skill, "LaunchRequest")
    assert response["card"] == {"type": "LinkAccount"} and response["shouldEndSession"] is True


def test_open_family_os_starts_a_conversation(skill):
    _, token = linked_token(skill)
    response = ask(skill, "LaunchRequest", token=token)
    assert "open the calendar" in response["outputSpeech"]["text"] and response["shouldEndSession"] is False


def test_open_the_calendar_reaches_the_tv_through_mcp(skill):
    parent, token = linked_token(skill)
    tv = pair_tv(skill, parent)
    start = skill.client.get("/v1/tv/commands", params={"after": -1}, headers=bearer(tv)).json()["data"]["latest"]
    response = ask(skill, intent="OpenIntent", request="the calendar", token=token)
    assert response["outputSpeech"]["text"] == "Showing the calendar on the TV."
    commands = skill.client.get("/v1/tv/commands", params={"after": start}, headers=bearer(tv)).json()["data"]["commands"]
    assert [item["screen"] for item in commands] == ["Calendar"]


def test_weather_through_mcp(skill, monkeypatch):
    parent, token = linked_token(skill)
    edit(skill, parent, "householdLocation", {"id": "location", "latitude": 32.22, "longitude": -110.93,
                                             "label": "Tucson, AZ", "source": "search", "timezone": "America/Phoenix"})

    async def forecast(latitude, longitude, location):
        return {"location": location, "temperatureF": 71, "highF": 76, "lowF": 60, "condition": "Sunny"}

    monkeypatch.setattr(skill.main.voice_server, "weather", forecast)
    text = ask(skill, intent="WhatIntent", request="the weather today", token=token)["outputSpeech"]["text"]
    assert text.startswith("Right now in Tucson, AZ it's 71 degrees")


def test_a_pickup_swap_waits_for_a_parent(skill):
    parent, token = linked_token(skill)
    text = ask(skill, intent="SwapIntent", request="Emma pickup to Alex", token=token)["outputSpeech"]["text"]
    assert "confirm" in text.lower()
    proposals = skill.client.get("/v1/household", headers=bearer(parent)).json()["data"]["proposals"]
    assert [item["status"] for item in proposals] == ["pending"]


def test_stop_and_session_end(skill):
    _, token = linked_token(skill)
    assert ask(skill, intent="AMAZON.StopIntent", token=token)["outputSpeech"]["text"] == "Okay."
    assert ask(skill, "SessionEndedRequest", token=token) == {}


def test_the_endpoint_is_off_without_a_skill_id(api):
    assert api.client.post("/alexa", content=b"{}").status_code == 404


def test_unsigned_requests_are_refused(api, monkeypatch):
    monkeypatch.setattr(api.main, "ALEXA_SKILL_ID", SKILL)
    reply = api.client.post("/alexa", content=_body(), headers={"Content-Type": "application/json"})
    assert reply.status_code == 400


def test_utterances_are_rebuilt_from_intents():
    assert alexa.utterance_for({"name": "OpenIntent", "slots": {"request": {"value": "the calendar"}}}) == "open the calendar"
    assert alexa.utterance_for({"name": "HowManyIntent", "slots": {"request": {"value": "stars does Leo have"}}}) == "how many stars does Leo have"
    assert alexa.utterance_for({"name": "OpenIntent", "slots": {}}) is None
    assert alexa.utterance_for({"name": "SomethingElse", "slots": {"request": {"value": "x"}}}) is None
