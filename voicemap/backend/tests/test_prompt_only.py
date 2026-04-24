"""Smoke-test the extraction prompt with a handful of hardcoded transcripts.

No audio, no FastAPI, no DB. Run this first when iterating on the
system prompt:

    cd voicemap/backend
    source venv/bin/activate
    python -m tests.test_prompt_only
"""
import asyncio
import sys
from pathlib import Path

# Allow running as `python -m tests.test_prompt_only` from voicemap/backend/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.extraction import extract_report_from_text  # noqa: E402


SAMPLES = [
    "There's a broken streetlight at Oak and 5th, been out three weeks, my kid walks this way to school.",
    "Huge pothole on Mission Street near 24th, almost blew my tire.",
    "Someone dumped a whole sofa and trash bags behind the library on Elm Street last night.",
]


async def main() -> None:
    for text in SAMPLES:
        print(f"\n── Input: {text}")
        result = await extract_report_from_text(text)
        print(f"   Category:   {result.category}")
        print(f"   Severity:   {result.severity}")
        print(f"   Location:   {result.specific_location!r}")
        print(f"   Duration:   {result.duration!r}")
        print(f"   Tags:       {result.tags}")
        print(f"   Summary:    {result.impact_summary}")
        print(f"   Confidence: {result.confidence}")


if __name__ == "__main__":
    asyncio.run(main())
