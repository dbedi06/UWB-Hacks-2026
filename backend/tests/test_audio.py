"""End-to-end audio extraction smoke test.

Reads backend/tests/fixtures/sample_voice.m4a (gitignored — drop your
own voice memo there) and runs it through Whisper + GPT-4o. Prints the
parsed ExtractedReport. Use this when iterating on prompt or audio
handling — faster feedback loop than going through the FastAPI route.

Run from the repo root:

    source backend/venv/bin/activate
    python -m backend.tests.test_audio

If your phone records as 3GP-in-mp4 (common on Android), remux to a
real M4A container without re-encoding:

    ffmpeg -i your_recording.mp4 -c:a copy backend/tests/fixtures/sample_voice.m4a
"""
import asyncio
import sys
from pathlib import Path

from ai.extraction import extract_report_from_audio


FIXTURE = Path(__file__).resolve().parent / "fixtures" / "sample_voice.m4a"


async def main() -> None:
    if not FIXTURE.exists():
        print(f"missing fixture: {FIXTURE}", file=sys.stderr)
        print("record a 5-15 sec voice memo and save it there (gitignored).", file=sys.stderr)
        sys.exit(1)

    audio = FIXTURE.read_bytes()
    print(f"audio: {FIXTURE.name} ({len(audio):,} bytes)")

    result = await extract_report_from_audio(
        audio, mime_type="audio/m4a", filename=FIXTURE.name
    )

    print()
    print(f"Title:         {result.title}")
    print(f"Transcript:    {result.transcript}")
    print(f"Category:      {result.category}")
    print(f"Severity:      {result.severity}")
    print(f"Location:      {result.specific_location!r}")
    print(f"Duration:      {result.duration!r}")
    print(f"Tags:          {result.tags}")
    print(f"Impact:        {result.impact_summary}")
    print(f"Confidence:    {result.confidence}")


if __name__ == "__main__":
    asyncio.run(main())
