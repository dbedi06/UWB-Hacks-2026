"""API-level Pydantic models — wire format between backend and clients.

The LLM output schema (ExtractedReport) lives in voicemap/ai/models.py.
These models describe what the REST API returns, not what the LLM
produces.
"""
from pydantic import BaseModel
from typing import Literal, Optional


Status = Literal["open", "acknowledged", "resolved", "flagged"]


class LocationOut(BaseModel):
    lat: float
    lng: float
    resolved_from_text: bool = False


class ReportResponse(BaseModel):
    """What the API returns to clients for a single report."""
    id: str
    transcript: str
    report: dict
    location: LocationOut
    created_at: str
    status: Status
    cluster_id: Optional[str] = None


class ReportListResponse(BaseModel):
    reports: list[ReportResponse]
    count: int
