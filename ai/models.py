"""Pydantic models for LLM extraction output.

ExtractedReport is the structured schema we ask OpenAI to produce from a
voice transcript. Used directly as the `response_format` for
chat.completions.parse, so every field must be representable in strict
JSON Schema.

API-level response models (ReportResponse, LocationOut, etc.) live in
voicemap/backend/models.py — they belong to the REST layer, not the AI
pipeline.
"""
from pydantic import BaseModel, Field
from typing import Literal


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


class ExtractedReport(BaseModel):
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
