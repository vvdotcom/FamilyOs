"""Hometide's voice agent, built with the Strands Agents SDK on Amazon Bedrock.

The agent gets exactly the tools the Hometide MCP server offers (the same ones Alexa+ sees), so it can read the
calendar, show things on the TV, recall the routines Hometide learned (AgentCore Memory), and *propose* changes.
It never applies a change: proposals wait for a family member to confirm on the TV or phone.

``ToolAccess`` decides where the tools run: in-process for the simulated Alexa+ page, or over MCP (Streamable
HTTP) for the Alexa skill. Strands runs the model-tool loop; Hometide keeps the guard rails (budget, timeout,
spoken-reply cleanup, and the rules fallback in ``VoiceServer.converse``).
"""
from __future__ import annotations

import logging
import os
import re
from typing import Any, Awaitable, Callable

logger = logging.getLogger("familyos.agent.strands")

SYSTEM_PROMPT = (
    "You are Hometide, a family's shared calendar on their TV, answering through Alexa. "
    "Answer in one or two short spoken sentences: summarize, and never list more than three events "
    "(say how many more there are instead). Use each event's responsibleFor wording, for example 'dropping off'. "
    "Always use tools for facts; never invent events. "
    "Only call a propose_ tool when the user asks for a change. If you find a conflict, say what it is and offer "
    "the fix as a question instead of proposing it. "
    "When the user asks for a change, call the propose_ tool right away, passing the user's own words "
    "(for example event='Emma pickup', to_member='Alex'); the tools find the matching item and return an "
    "error if they can't. Ask a follow-up question only after a tool returns an error. "
    "Tell the user the change is waiting for confirmation on the TV or phone. Never say a change is done. "
    "When asked what Hometide has learned, about the family's usual routines, or who usually does something, "
    "call get_learned_routines."
)

DEFAULT_MODEL = "us.amazon.nova-lite-v1:0"


def model_id() -> str:
    return os.getenv("FAMILYOS_BEDROCK_MODEL_ID") or DEFAULT_MODEL


def region() -> str:
    return os.getenv("AWS_REGION") or "us-west-2"


ToolCall = Callable[[str, dict[str, Any]], Awaitable[dict[str, Any]]]


def build_tools(listed: list[dict[str, Any]], call: ToolCall, record: dict[str, list]) -> list[Any]:
    """Wrap each Hometide tool as a Strands tool. ``record`` collects tool names, proposal ids and tool speech."""
    from mcp.server.fastmcp.exceptions import ToolError
    from strands.tools.tools import PythonAgentTool

    def wrap(spec: dict[str, Any]):
        name = spec["name"]

        async def run(tool_use, **_invocation_state):
            record["calls"].append(name)
            try:
                output = await call(name, tool_use.get("input") or {})
            except ToolError as error:
                return {"toolUseId": tool_use["toolUseId"], "status": "error", "content": [{"text": str(error)}]}
            if "proposalId" in output:
                record["proposals"].append(output["proposalId"])
            if isinstance(output.get("speech"), str) and output["speech"].strip():
                record["spoken"].append(output["speech"].strip())
            return {"toolUseId": tool_use["toolUseId"], "status": "success", "content": [{"json": output}]}

        run.__name__ = name
        return PythonAgentTool(name, {"name": name, "description": spec.get("description") or name,
                                      "inputSchema": {"json": spec["inputSchema"]}}, run)

    return [wrap(spec) for spec in listed]


def build_agent(tools: list[Any]):
    from botocore.config import Config
    from strands import Agent
    from strands.models.bedrock import BedrockModel

    model = BedrockModel(model_id=model_id(), region_name=region(), temperature=0, max_tokens=400, streaming=False,
                         boto_client_config=Config(connect_timeout=4, read_timeout=20, retries={"max_attempts": 0}))
    return Agent(model=model, system_prompt=SYSTEM_PROMPT, tools=tools, callback_handler=None)


def reply_text(result: Any) -> str:
    message = getattr(result, "message", None) or {}
    parts = [block.get("text", "") for block in message.get("content", []) if isinstance(block, dict)]
    return " ".join(part for part in parts if part) or str(result or "")


CHANGE_WORDS = re.compile(r"\b(swap|switch|change|have|let|move|reschedule|schedule|add|put|book|cancel|assign|"
                          r"finished|did|done|completed|take over|instead)\b", re.IGNORECASE)
CHANGE_TOOLS = ("propose_", "mark_chore_done_request")


def asks_for_change(utterance: str) -> bool:
    return bool(CHANGE_WORDS.search(utterance or ""))


async def answer(utterance: str, listed: list[dict[str, Any]], call: ToolCall) -> dict[str, Any]:
    """One spoken request through a Strands agent. Same result shape as the rules path."""
    from .voice import strip_model_reasoning

    if not asks_for_change(utterance):
        # A question never creates a request: the model only gets the read tools (and show_on_tv).
        listed = [tool for tool in listed if not tool["name"].startswith(CHANGE_TOOLS)]
    record: dict[str, list] = {"calls": [], "proposals": [], "spoken": []}
    agent = build_agent(build_tools(listed, call, record))
    result = await agent.invoke_async(utterance)
    reply = strip_model_reasoning(reply_text(result))
    # Nova sometimes answers with only <thinking> notes; then speak the tools' own answer, or let the caller fall
    # back to the rules (an empty reply).
    return {"mode": "bedrock", "engine": "strands", "model": model_id(),
            "reply": reply or " ".join(record["spoken"][-2:]), "toolCalls": record["calls"],
            "proposalIds": record["proposals"]}
