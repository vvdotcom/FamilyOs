"""MCP 2025-11-25 conformance checks for Hometide's Streamable HTTP server (/mcp).

Against the live service (token: a voice connection token from the Hometide app, Settings > Voice):

    HOMETIDE_MCP_TOKEN=fos_voice_... python scripts/mcp_conformance.py https://hometide.up.railway.app

The same checks run in CI against the in-process app (tests/test_mcp_conformance.py). Each check prints PASS or
FAIL with the reason; the exit code is the number of failures.
"""
from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field
from typing import Any, Callable

import httpx

PROTOCOL = "2025-11-25"
ACCEPT = "application/json, text/event-stream"


@dataclass
class Report:
    results: list[tuple[str, bool, str]] = field(default_factory=list)

    def check(self, name: str, ok: bool, detail: str = "") -> None:
        self.results.append((name, bool(ok), detail))

    @property
    def failures(self) -> list[tuple[str, bool, str]]:
        return [item for item in self.results if not item[1]]


def _rpc(client: httpx.Client, base: str, token: str | None, method: str, params: dict | None = None,
         *, version: str | None = PROTOCOL, notify: bool = False, **headers: str) -> httpx.Response:
    sent = {"Accept": ACCEPT, "Content-Type": "application/json", **headers}
    if token:
        sent["Authorization"] = f"Bearer {token}"
    if version:
        sent["MCP-Protocol-Version"] = version
    body: dict[str, Any] = {"jsonrpc": "2.0", "method": method, "params": params or {}}
    if not notify:
        body["id"] = 1
    return client.post(f"{base}/mcp", headers=sent, json=body)


def run(client: httpx.Client, base: str, token: str) -> Report:
    base = base.rstrip("/")
    report = Report()

    # Authorization (MCP 2025-11-25 section "Authorization"): 401 + RFC 9728 protected resource metadata.
    anonymous = _rpc(client, base, None, "initialize", version=None)
    challenge = anonymous.headers.get("www-authenticate", "")
    report.check("unauthenticated request gets 401", anonymous.status_code == 401, str(anonymous.status_code))
    report.check("401 names the resource metadata", "resource_metadata=" in challenge, challenge[:120])
    metadata = client.get(f"{base}/.well-known/oauth-protected-resource/mcp")
    data = metadata.json() if metadata.status_code == 200 else {}
    report.check("protected resource metadata is published", metadata.status_code == 200, str(metadata.status_code))
    report.check("metadata resource is this /mcp endpoint", str(data.get("resource", "")).endswith("/mcp"), str(data.get("resource")))
    report.check("metadata names an authorization server", bool(data.get("authorization_servers")), "")
    report.check("bad bearer token gets 401", _rpc(client, base, "not-a-real-token", "tools/list").status_code == 401, "")

    # Lifecycle: initialize negotiates the protocol version and returns capabilities.
    init = _rpc(client, base, token, "initialize", {"protocolVersion": PROTOCOL, "capabilities": {},
                                                    "clientInfo": {"name": "hometide-conformance", "version": "1"}},
                version=None)
    result = (init.json() if init.status_code == 200 else {}).get("result", {})
    report.check("initialize succeeds", init.status_code == 200, init.text[:120] if init.status_code != 200 else "")
    report.check(f"negotiates protocol {PROTOCOL}", result.get("protocolVersion") == PROTOCOL, str(result.get("protocolVersion")))
    capabilities = result.get("capabilities", {})
    report.check("declares tools and resources", "tools" in capabilities and "resources" in capabilities, str(list(capabilities)))
    note = _rpc(client, base, token, "notifications/initialized", notify=True)
    report.check("notification gets 202 Accepted", note.status_code == 202, str(note.status_code))

    # Transport: protocol header and Origin validation (DNS rebinding protection).
    report.check("unsupported MCP-Protocol-Version is rejected",
                 _rpc(client, base, token, "tools/list", version="1999-01-01").status_code == 400, "")
    report.check("cross-site browser Origin is rejected",
                 _rpc(client, base, token, "tools/list", Origin="https://evil.example").status_code == 403, "")
    report.check("ping answers", _rpc(client, base, token, "ping").status_code == 200, "")

    # Server features.
    tools = (_rpc(client, base, token, "tools/list").json().get("result") or {}).get("tools", [])
    names = {tool.get("name") for tool in tools}
    report.check("tools/list returns tools with input schemas",
                 bool(tools) and all(tool.get("inputSchema", {}).get("type") == "object" for tool in tools), f"{len(tools)} tools")
    report.check("read and propose tools are present",
                 {"get_today", "show_on_tv", "propose_pickup_swap", "get_learned_routines"} <= names, ", ".join(sorted(names)))
    report.check("tools carry descriptions", all(tool.get("description") for tool in tools), "")
    resources = (_rpc(client, base, token, "resources/list").json().get("result") or {}).get("resources", [])
    report.check("MCP Apps card resource is listed",
                 any(item.get("uri") == "ui://hometide/today.html" for item in resources), "")
    today = _rpc(client, base, token, "tools/call", {"name": "get_today", "arguments": {}}).json().get("result") or {}
    report.check("tools/call returns structured content", isinstance(today.get("structuredContent"), dict) and not today.get("isError"), "")
    unknown = _rpc(client, base, token, "tools/call", {"name": "not_a_tool", "arguments": {}}).json()
    report.check("unknown tool is an error, not a crash",
                 "error" in unknown or (unknown.get("result") or {}).get("isError") is True, "")
    return report


def print_report(report: Report, out: Callable[[str], None] = print) -> None:
    for name, ok, detail in report.results:
        out(f"{'PASS' if ok else 'FAIL'}  {name}{f'  ({detail})' if detail and not ok else ''}")
    out(f"\n{len(report.results) - len(report.failures)}/{len(report.results)} checks passed")


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else os.getenv("HOMETIDE_URL", "https://hometide.up.railway.app")
    secret = os.getenv("HOMETIDE_MCP_TOKEN", "")
    if not secret:
        sys.exit("Set HOMETIDE_MCP_TOKEN to a voice connection token (Hometide app > Settings > Voice).")
    with httpx.Client(timeout=20) as http:
        outcome = run(http, target, secret)
    print_report(outcome)
    sys.exit(len(outcome.failures))
