"""OpenAI configuration for the extraction pipeline.

Loads env vars from voicemap/backend/.env so backend and ai share a
single secrets file.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / "backend" / ".env")

OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]
OPENAI_TRANSCRIPTION_MODEL = os.getenv("OPENAI_TRANSCRIPTION_MODEL", "whisper-1")
OPENAI_EXTRACTION_MODEL = os.getenv("OPENAI_EXTRACTION_MODEL", "gpt-4o-2024-08-06")
