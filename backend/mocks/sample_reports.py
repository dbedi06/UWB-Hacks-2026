"""Canned ExtractedReport samples for demo-mode resilience.

When `x-mock: true` header is present or MOCK_MODE=true is set in .env,
POST /api/submit-report returns one of these instead of hitting OpenAI.
Critical for demo day — if OpenAI is slow or rate-limited we still drop
a pin with realistic-looking data.
"""
import random

from ai.models import ExtractedReport


SAMPLES: list[ExtractedReport] = [
    ExtractedReport(
        transcript="There's a broken streetlight at the corner of Oak and 5th, it's been out for three weeks and my kid walks this way to school.",
        category="streetlight",
        severity="high",
        specific_location="corner of Oak and 5th",
        duration="three weeks",
        tags=["near_school", "affects_children", "recurring_issue"],
        impact_summary="Parent reports unlit intersection on child's walking route to school, outage persisting three weeks despite apparent neglect.",
        confidence=0.95,
    ),
    ExtractedReport(
        transcript="Huge pothole on Mission near 24th, I almost blew a tire yesterday and there was a cyclist who had to swerve into traffic.",
        category="pothole",
        severity="high",
        specific_location="Mission Street near 24th",
        duration="",
        tags=["affects_cyclists", "pedestrian_hazard"],
        impact_summary="Reporter describes a large pothole on Mission near 24th causing near-miss between cyclist and vehicle traffic.",
        confidence=0.9,
    ),
    ExtractedReport(
        transcript="The crosswalk light at Valencia and 16th hasn't been working for days, old folks from the senior center have been crossing in traffic.",
        category="crosswalk_traffic",
        severity="high",
        specific_location="Valencia and 16th",
        duration="several days",
        tags=["affects_elderly", "pedestrian_hazard", "recurring_issue"],
        impact_summary="Broken crosswalk signal at Valencia and 16th has forced elderly residents to cross against active traffic for multiple days.",
        confidence=0.92,
    ),
]


def random_sample() -> ExtractedReport:
    return random.choice(SAMPLES)
