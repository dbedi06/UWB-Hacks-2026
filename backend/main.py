"""VoiceMap backend — FastAPI entrypoint.

Run from the repo root:

    source backend/venv/bin/activate
    uvicorn backend.main:app --reload --port 8000
"""
import logging
from typing import Optional

from fastapi import FastAPI, File, Form, Header, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from ai import extraction
from backend import config
from backend.mocks.sample_reports import random_sample
from backend.models import ReportListResponse
from backend.services import db


logging.basicConfig(level=logging.INFO)
log = logging.getLogger("voicemap")

app = FastAPI(title="VoiceMap API", version="0.1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_origin_regex=config.ALLOWED_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": message, "code": code})


# ─── Routes ───────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    db_ok = await db.check_connection()
    return {
        "ok": db_ok,
        "openai": "reachable",  # Not pinged every health check
        "db": "reachable" if db_ok else "unreachable",
    }


@app.post("/api/submit-report")
async def submit_report(
    audio: UploadFile = File(...),
    lat: float = Form(...),
    lng: float = Form(...),
    x_mock: Optional[str] = Header(default=None),
):
    if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
        return _error(400, "invalid_location", "Latitude or longitude out of range")

    use_mock = config.MOCK_MODE or x_mock == "true"
    if use_mock:
        log.info("mock mode: skipping OpenAI")
        report = random_sample()
        try:
            result = await db.insert_report(lat=lat, lng=lng, report=report, mock=True)
        except db.DBError as e:
            log.exception("db write failed in mock mode")
            return _error(500, "db_write_failed", str(e))
        return result.model_dump()

    audio_bytes = await audio.read()
    if len(audio_bytes) < config.MIN_AUDIO_BYTES:
        return _error(400, "audio_too_short", "Recording is too short")
    if len(audio_bytes) > config.MAX_AUDIO_BYTES:
        return _error(400, "audio_too_large", f"Recording exceeds {config.MAX_AUDIO_BYTES} bytes")

    mime = audio.content_type or "audio/webm"
    if mime not in config.SUPPORTED_AUDIO_MIMES:
        log.warning(f"unsupported mime {mime}; attempting anyway")

    filename = audio.filename or "audio.webm"

    try:
        report = await extraction.extract_report_from_audio(
            audio_bytes, mime_type=mime, filename=filename
        )
    except extraction.ExtractionError as e:
        log.exception("extraction failed")
        return _error(500, "extraction_failed", str(e))

    if len(report.transcript.strip()) < config.MIN_TRANSCRIPT_CHARS:
        return _error(400, "audio_too_short", "Could not understand audio")

    try:
        result = await db.insert_report(lat=lat, lng=lng, report=report)
    except db.DBError as e:
        log.exception("db write failed")
        return _error(500, "db_write_failed", str(e))

    return result.model_dump()


@app.get("/api/reports")
async def list_reports(
    limit: int = 500,
    since: Optional[str] = None,
    category: Optional[str] = None,
    bbox: Optional[str] = None,
):
    bbox_tuple = None
    if bbox:
        try:
            parts = [float(x) for x in bbox.split(",")]
            if len(parts) != 4:
                raise ValueError
            bbox_tuple = tuple(parts)
        except ValueError:
            return _error(400, "invalid_bbox", "bbox must be minLng,minLat,maxLng,maxLat")

    try:
        reports = await db.list_reports(
            limit=limit, since=since, category=category, bbox=bbox_tuple
        )
    except db.DBError as e:
        return _error(500, "db_read_failed", str(e))

    return ReportListResponse(reports=reports, count=len(reports)).model_dump()


@app.get("/api/reports/{report_id}")
async def get_report(report_id: str):
    try:
        report = await db.get_report(report_id)
    except db.DBError as e:
        return _error(500, "db_read_failed", str(e))

    if not report:
        return _error(404, "not_found", "Report not found")

    return report.model_dump()
