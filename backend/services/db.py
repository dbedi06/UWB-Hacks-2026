"""JSON file-based stand-in for the Supabase `reports` table.

Row shape on disk matches the Supabase DDL in backend/migrations/001_initial.sql
exactly — same column names, same types. When Supabase is ready, only
the internals of this module change; the function signatures and the
ReportResponse wire format stay identical.

Concurrency: a module-level threading.Lock serialises writes. Atomic
replacement (os.replace on a .tmp file) avoids a torn file if the
process is killed mid-write.
"""
import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from uuid import uuid4

from ai.models import ExtractedReport
from backend import config
from backend.models import LocationOut, ReportResponse


class DBError(Exception):
    """Raised on any read/write failure of the JSON store."""
    pass


# ─── Path resolution ──────────────────────────────────────────────────
# Relative paths resolve against backend/, so `data/reports.json` means
# backend/data/reports.json regardless of the cwd that uvicorn is run
# from. Absolute paths are used as-is.
_raw_path = Path(config.REPORTS_JSON_PATH)
if _raw_path.is_absolute():
    _PATH = _raw_path
else:
    _PATH = Path(__file__).resolve().parent.parent / _raw_path
_PATH.parent.mkdir(parents=True, exist_ok=True)

_lock = threading.Lock()


def _load() -> list[dict]:
    """Read all rows. Returns [] for a missing or empty file."""
    if not _PATH.exists() or _PATH.stat().st_size == 0:
        return []
    with _PATH.open("r", encoding="utf-8") as f:
        return json.load(f)


def _save_atomic(rows: list[dict]) -> None:
    """Write all rows via tmp-file + rename to avoid torn writes."""
    tmp = _PATH.with_suffix(_PATH.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)
    os.replace(tmp, _PATH)


# ─── Public API ───────────────────────────────────────────────────────

async def insert_report(
    *,
    lat: float,
    lng: float,
    report: ExtractedReport,
    location_resolved: bool = False,
    mock: bool = False,
) -> ReportResponse:
    """Append a new report row and return it as a ReportResponse."""
    report_id = str(uuid4())
    now = datetime.now(timezone.utc)

    row = {
        "id": report_id,
        "created_at": now.isoformat(),
        "lat": lat,
        "lng": lng,
        "extracted_location_text": report.specific_location or None,
        "location_resolved": location_resolved,
        "transcript": report.transcript,
        "title": report.title,
        "category": report.category,
        "severity": report.severity,
        "duration": report.duration or None,
        "tags": report.tags,
        "impact_summary": report.impact_summary,
        "confidence": report.confidence,
        "is_crime": report.is_crime,
        "status": "open",
        "cluster_id": None,
        "mock": mock,
    }

    try:
        with _lock:
            rows = _load()
            rows.append(row)
            _save_atomic(rows)
    except Exception as e:
        raise DBError(f"Insert failed: {e}") from e

    return _row_to_response(row)


async def get_report(report_id: str) -> Optional[ReportResponse]:
    try:
        rows = _load()
    except Exception as e:
        raise DBError(f"Read failed: {e}") from e

    for row in rows:
        if row["id"] == report_id:
            return _row_to_response(row)
    return None


async def list_reports(
    *,
    limit: int = 500,
    since: Optional[str] = None,
    category: Optional[str] = None,
    bbox: Optional[tuple[float, float, float, float]] = None,
) -> list[ReportResponse]:
    try:
        rows = _load()
    except Exception as e:
        raise DBError(f"Read failed: {e}") from e

    if since:
        rows = [r for r in rows if r["created_at"] >= since]
    if category:
        rows = [r for r in rows if r["category"] == category]
    if bbox:
        min_lng, min_lat, max_lng, max_lat = bbox
        rows = [
            r for r in rows
            if min_lng <= r["lng"] <= max_lng and min_lat <= r["lat"] <= max_lat
        ]

    rows.sort(key=lambda r: r["created_at"], reverse=True)
    capped = min(limit, config.MAX_REPORTS_PER_REQUEST)
    return [_row_to_response(r) for r in rows[:capped]]


async def check_connection() -> bool:
    """Return True if the store is readable (or legitimately empty)."""
    try:
        _load()
        return True
    except Exception:
        return False


# ─── Internal ─────────────────────────────────────────────────────────

def _row_to_response(row: dict) -> ReportResponse:
    return ReportResponse(
        id=row["id"],
        transcript=row["transcript"],
        report={
            "title": row.get("title") or "",
            "category": row["category"],
            "severity": row["severity"],
            "specific_location": row.get("extracted_location_text") or "",
            "duration": row.get("duration") or "",
            "tags": row.get("tags") or [],
            "impact_summary": row["impact_summary"],
            "confidence": row.get("confidence") or 0.0,
            "is_crime": bool(row.get("is_crime", False)),
        },
        location=LocationOut(
            lat=row["lat"],
            lng=row["lng"],
            resolved_from_text=row.get("location_resolved", False),
        ),
        created_at=row["created_at"],
        status=row.get("status", "open"),
        cluster_id=row.get("cluster_id"),
    )
