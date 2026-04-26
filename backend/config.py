"""Backend configuration: paths, CORS, feature flags, audio constants.

OpenAI settings live in voicemap/ai/config.py — the AI pipeline and the
backend are separate packages per the project structure on main.

`.env` is loaded from voicemap/backend/.env regardless of cwd.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

# ─── Paths ────────────────────────────────────────────────────────────
REPORTS_JSON_PATH = os.getenv("REPORTS_JSON_PATH", "data/reports.json")

# ─── Feature flags ────────────────────────────────────────────────────
MOCK_MODE = os.getenv("MOCK_MODE", "false").lower() == "true"

# ─── CORS ─────────────────────────────────────────────────────────────
ALLOWED_ORIGINS = [
    o.strip() for o in os.getenv(
        "ALLOWED_ORIGINS", "http://localhost:3000"
    ).split(",") if o.strip()
]

# Quick tunnels (cloudflared / ngrok) hand out fresh hostnames on every
# restart, so an explicit list would rot. The regex matches any
# trycloudflare.com or ngrok subdomain — used in addition to ALLOWED_ORIGINS.
ALLOWED_ORIGIN_REGEX = os.getenv(
    "ALLOWED_ORIGIN_REGEX",
    r"https://([a-z0-9-]+\.)?(trycloudflare\.com|ngrok-free\.app|ngrok\.app|ngrok\.io)",
)

# ─── Audio constants ──────────────────────────────────────────────────
MAX_AUDIO_BYTES = 5 * 1024 * 1024            # 5 MB
MIN_AUDIO_BYTES = 1_000                       # 1 KB
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
