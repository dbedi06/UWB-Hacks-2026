"""Smoke-test the extraction prompt with a handful of hardcoded transcripts.

No audio, no FastAPI, no DB. Run this first when iterating on the
system prompt:

    source backend/venv/bin/activate
    python -m ai.tests.test_prompt_only
"""
import asyncio

from ai.extraction import extract_report_from_text


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
