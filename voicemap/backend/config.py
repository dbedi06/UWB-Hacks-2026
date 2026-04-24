"""Configuration loaded from environment variables.

`.env` is auto-loaded from the current working directory. Required env
vars raise KeyError at import time — failing loudly is the right
behavior for a boot-time misconfiguration.
"""
import os
from dotenv import load_dotenv

load_dotenv()

# ─── Required ─────────────────────────────────────────────────────────
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]

# ─── Optional (with defaults) ─────────────────────────────────────────
OPENAI_TRANSCRIPTION_MODEL = os.getenv("OPENAI_TRANSCRIPTION_MODEL", "whisper-1")
OPENAI_EXTRACTION_MODEL = os.getenv("OPENAI_EXTRACTION_MODEL", "gpt-4o-2024-08-06")

REPORTS_JSON_PATH = os.getenv("REPORTS_JSON_PATH", "data/reports.json")

MOCK_MODE = os.getenv("MOCK_MODE", "false").lower() == "true"

ALLOWED_ORIGINS = [
    o.strip() for o in os.getenv(
        "ALLOWED_ORIGINS", "http://localhost:3000"
    ).split(",") if o.strip()
]

# ─── Constants ────────────────────────────────────────────────────────
MAX_AUDIO_BYTES = 5 * 1024 * 1024           # 5 MB
MIN_AUDIO_BYTES = 1_000                      # 1 KB
MIN_TRANSCRIPT_CHARS = 5
MAX_REPORTS_PER_REQUEST = 1000

SUPPORTED_AUDIO_MIMES = {
    "audio/webm",
    "audio/mp4",
    "audio/ogg",
    "audio/wav",
    "audio/x-wav",
    "audio/mpeg",
    "audio/m4a",
}
