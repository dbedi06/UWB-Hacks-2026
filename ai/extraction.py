"""OpenAI extraction service: audio -> transcript -> ExtractedReport.

Two-step pipeline:
  1. Whisper transcribes the audio bytes to text.
  2. GPT-4o extracts structured fields via `chat.completions.parse` with
     ExtractedReport as the `response_format` (strict JSON schema).

The async wrappers use AsyncOpenAI so the FastAPI event loop isn't
blocked during the (potentially multi-second) network round-trip.
"""
from openai import AsyncOpenAI, OpenAIError

from ai.models import ExtractedReport
from ai.prompts.extract import SYSTEM_PROMPT
from ai import config


_client = AsyncOpenAI(api_key=config.OPENAI_API_KEY)


class ExtractionError(Exception):
    """Raised when OpenAI extraction fails or returns unusable output."""
    pass


async def extract_report_from_text(transcript: str) -> ExtractedReport:
    """Extract structured fields from a pre-transcribed text."""
    try:
        response = await _client.chat.completions.parse(
            model=config.OPENAI_EXTRACTION_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f'Transcript from resident: "{transcript}"'},
            ],
            response_format=ExtractedReport,
            temperature=0.2,
        )
    except OpenAIError as e:
        raise ExtractionError(f"OpenAI extraction call failed: {e}") from e

    message = response.choices[0].message
    if message.refusal:
        raise ExtractionError(f"OpenAI refused the request: {message.refusal}")
    if message.parsed is None:
        raise ExtractionError("OpenAI returned no parsed object")

    result = message.parsed
    if not result.transcript:
        result.transcript = transcript
    return result


async def extract_report_from_audio(
    audio_bytes: bytes,
    mime_type: str = "audio/webm",
    filename: str = "audio.webm",
) -> ExtractedReport:
    """Transcribe audio with Whisper then extract structured fields."""
    try:
        transcription = await _client.audio.transcriptions.create(
            model=config.OPENAI_TRANSCRIPTION_MODEL,
            file=(filename, audio_bytes, mime_type),
        )
    except OpenAIError as e:
        raise ExtractionError(f"Whisper transcription failed: {e}") from e

    transcript = transcription.text.strip()
    if not transcript:
        raise ExtractionError("Whisper returned empty transcript")

    return await extract_report_from_text(transcript)
