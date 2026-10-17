"""Use Hometide from any MCP host: connect to its MCP server the way Claude Desktop, Kiro or an Alexa+ add-on would.

    1. In the phone app: Family → Voice · Alexa+ → Connect a voice assistant. Copy the connection key (shown once).
    2. python scripts/mcp_host_check.py                  # asks for the key; reads only
       python scripts/mcp_host_check.py --propose        # also proposes "Emma pickup → Lindsey" on Tuesday

It lists the tools, asks what Hometide has learned about the family, lists the clashes to fix, and with --propose
sends a pickup swap. A proposal changes nothing: it waits on the paired Fire TV (and in the phone app) until a parent
confirms it there. The key is read from HOMETIDE_MCP_TOKEN or the terminal and never printed; revoke it in the same
screen when you're done. Default server: https://hometide.up.railway.app/mcp (--url for another one).
"""
from __future__ import annotations

import argparse
import asyncio
import getpass
import json
import os
import sys

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

HOSTED = "https://hometide.up.railway.app/mcp"


def result_data(result) -> object:
    """The tool's structured result if it has one, otherwise its text."""
    if getattr(result, "structuredContent", None):
        data = result.structuredContent
        return data.get("result", data) if isinstance(data, dict) and set(data) == {"result"} else data
    texts = [item.text for item in result.content if getattr(item, "type", "") == "text"]
    joined = "\n".join(texts)
    try:
        return json.loads(joined)
    except ValueError:
        return joined


def show(title: str, data: object) -> None:
    print(f"\n== {title}")
    print(json.dumps(data, indent=2, ensure_ascii=False) if not isinstance(data, str) else data)


async def run(url: str, token: str, propose: bool, event: str, to_member: str, day: str) -> int:
    async with streamablehttp_client(url, headers={"Authorization": f"Bearer {token}"}) as (read, write, _):
        async with ClientSession(read, write) as session:
            info = await session.initialize()
            print(f"Connected to {info.serverInfo.name} (MCP {info.protocolVersion}) at {url}")
            tools = (await session.list_tools()).tools
            print(f"{len(tools)} tools: " + ", ".join(tool.name for tool in tools))

            learned = await session.call_tool("get_learned_routines", {"question": "What has Hometide learned about us?"})
            show("get_learned_routines: what Hometide has learned", result_data(learned))
            conflicts = await session.call_tool("list_conflicts", {})
            show("list_conflicts: clashes to fix", result_data(conflicts))

            if propose:
                reply = await session.call_tool("propose_pickup_swap", {"event": event, "to_member": to_member, "day": day})
                show("propose_pickup_swap", result_data(reply))
                if reply.isError:
                    return 1
                print("\nNothing has changed yet: confirm (or decline) it on the paired Fire TV with the remote.")
            failed = [name for name, call in (("get_learned_routines", learned), ("list_conflicts", conflicts)) if call.isError]
            return 1 if failed else 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Call Hometide's MCP server as any MCP host would.")
    parser.add_argument("--url", default=os.getenv("HOMETIDE_MCP_URL", HOSTED))
    parser.add_argument("--propose", action="store_true", help="also propose a pickup swap (it waits on the TV)")
    parser.add_argument("--event", default="Emma pickup")
    parser.add_argument("--to", default="Lindsey", dest="to_member")
    parser.add_argument("--day", default="Tuesday")
    args = parser.parse_args()
    token = os.getenv("HOMETIDE_MCP_TOKEN") or getpass.getpass("Hometide connection key (hidden): ").strip()
    if not token:
        print("No connection key given.", file=sys.stderr)
        return 2
    try:
        return asyncio.run(run(args.url, token, args.propose, args.event, args.to_member, args.day))
    except BaseException as error:  # the MCP client wraps network errors in exception groups
        status = first_status(error)
        if status in (401, 403):
            print(f"The server refused the connection key ({status}). Create a new one in the phone app "
                  "(Family → Voice · Alexa+) and try again.", file=sys.stderr)
        elif status:
            print(f"The MCP server answered {status}. Check --url ({args.url}).", file=sys.stderr)
        else:
            cause = innermost(error)
            print(f"Couldn't reach {args.url}: {type(cause).__name__}: {cause}", file=sys.stderr)
        return 1


def innermost(error: BaseException) -> BaseException:
    inner = list(getattr(error, "exceptions", ()) or ())
    return innermost(inner[0]) if inner else error


def first_status(error: BaseException) -> int | None:
    """The HTTP status inside a (possibly nested) exception group, if any."""
    response = getattr(error, "response", None)
    if response is not None and getattr(response, "status_code", None):
        return int(response.status_code)
    for inner in getattr(error, "exceptions", ()) or ():
        status = first_status(inner)
        if status:
            return status
    return first_status(error.__cause__) if error.__cause__ else None


if __name__ == "__main__":
    sys.exit(main())
