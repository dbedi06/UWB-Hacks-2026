"""Pydantic models for the VoiceMap API.

These are the single source of truth for the wire format exchanged with
the frontend and for the structured output extracted by OpenAI.
"""
from pydantic import BaseModel, Field
from typing import Literal, Optional


Category = Literal[
    "pothole",
    "streetlight",
    "crosswalk_traffic",
    "sidewalk",
    "graffiti_vandalism",
    "trash_dumping",
    "water_sewer",
    "trees_vegetation",
    "noise",
    "stray_animal",
    "encampment",
    "other",
]

Severity = Literal["low", "medium", "high", "emergency"]
Status = Literal["open", "acknowledged", "resolved", "flagged"]


class ExtractedReport(BaseModel):
    """The structured output we expect from the LLM.

    Also used as the `response_format` schema for OpenAI's structured
    outputs, so every field needs to be representable in strict JSON
    Schema (Literal, str, list[str], float with bounds).
    """
    transcript: str = Field(description="Verbatim transcription of the audio")
    category: Category
    severity: Severity
    specific_location: str = Field(
        default="",
        description="Street, intersection, or address mentioned; empty if none",
    )
    duration: str = Field(
        default="",
        description="How long the issue has existed; empty if not mentioned",
    )
    tags: list[str] = Field(
        default_factory=list,
        description="snake_case descriptive tags, e.g. ['near_school', 'child_safety']",
    )
    impact_summary: str = Field(
        description="One sentence preserving reporter's context and stakes"
    )
    confidence: float = Field(ge=0.0, le=1.0)


class LocationOut(BaseModel):
    lat: float
    lng: float
    resolved_from_text: bool = False


class ReportResponse(BaseModel):
    """What the API returns to clients."""
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
