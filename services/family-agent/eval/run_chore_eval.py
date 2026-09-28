"""Measure chore-photo verdicts against the labelled synthetic set.

    python eval/generate_chore_photos.py          # once; deterministic
    python eval/run_chore_eval.py --provider demo
    python eval/run_chore_eval.py --provider bedrock   # needs AWS_BEARER_TOKEN_BEDROCK and a vision model

Images go through the same processing as production uploads (EXIF stripped, 1024 px check variant).
"unclear" is counted as not correct; it is always safe because a parent still decides.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.photos import process_image  # noqa: E402
from app.vision import BedrockChoreVisionProvider, DemoChoreVisionProvider, check_chore_photo  # noqa: E402

PHOTOS = Path(__file__).with_name("chore_photos")


async def evaluate(provider_name: str) -> dict:
    if provider_name == "bedrock":
        import os

        model = os.getenv("FAMILYOS_BEDROCK_VISION_MODEL_ID") or os.getenv("FAMILYOS_BEDROCK_MODEL_ID") or "us.amazon.nova-lite-v1:0"
        provider = BedrockChoreVisionProvider(os.getenv("AWS_REGION") or "us-west-2", model)
    else:
        provider = DemoChoreVisionProvider()
    labels = json.loads((PHOTOS / "labels.json").read_text(encoding="utf-8"))
    rows = []
    for item in labels:
        variants, _, _ = process_image((PHOTOS / item["file"]).read_bytes(), ("check",))
        result = await check_chore_photo(provider, item["chore"], item["hint"], variants["check"])
        rows.append({**item, "verdict": result.verdict, "confidence": result.confidence, "provider": result.provider})
    not_done = [row for row in rows if row["label"] == "not_done"]
    summary = {
        "provider": provider_name,
        "photos": len(rows),
        "accuracy": round(sum(row["verdict"] == row["label"] for row in rows) / len(rows), 3),
        "false_looks_done_rate": round(sum(row["verdict"] == "looks_done" for row in not_done) / len(not_done), 3),
        "unclear_rate": round(sum(row["verdict"] == "unclear" for row in rows) / len(rows), 3),
        "fallbacks": sum(row["provider"] == "fallback" for row in rows),
        "by_chore": {},
    }
    for chore in sorted({row["chore"] for row in rows}):
        subset = [row for row in rows if row["chore"] == chore]
        summary["by_chore"][chore] = round(sum(row["verdict"] == row["label"] for row in subset) / len(subset), 3)
    return {"summary": summary, "rows": rows}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--provider", choices=["demo", "bedrock"], default="demo")
    args = parser.parse_args()
    if not (PHOTOS / "labels.json").exists():
        raise SystemExit("Run eval/generate_chore_photos.py first.")
    result = asyncio.run(evaluate(args.provider))
    out = Path(__file__).with_name("results")
    out.mkdir(exist_ok=True)
    (out / f"{args.provider}.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result["summary"], indent=2))


if __name__ == "__main__":
    main()
