"""The MCP conformance checks (scripts/mcp_conformance.py) against the in-process app."""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

from conftest import parent_token
from test_voice_mcp import voice_token

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "mcp_conformance.py"


def load_checks():
    spec = importlib.util.spec_from_file_location("mcp_conformance", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module  # dataclasses look their module up here.
    spec.loader.exec_module(module)
    return module


def test_every_conformance_check_passes(api):
    checks = load_checks()
    token = voice_token(api, parent_token(api))
    report = checks.run(api.client, "", token)
    lines: list[str] = []
    checks.print_report(report, lines.append)
    assert not report.failures, "\n".join(lines)
    assert len(report.results) >= 18
