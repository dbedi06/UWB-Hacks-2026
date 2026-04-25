"""Round-trip smoke test for the JSON file store.

Inserts two synthetic ExtractedReport instances, confirms:
  * list_reports returns them in created_at DESC order
  * get_report retrieves by id
  * category filter works
  * bbox filter works

Run from the repo root:

    source backend/venv/bin/activate
    python -m backend.tests.test_db_smoke

The test writes to whatever path REPORTS_JSON_PATH resolves to — by
default backend/data/reports.json. It does NOT clear existing rows;
inspect output to see inserted counts.
"""
import asyncio

from ai.models import ExtractedReport
from backend.services import db


async def main() -> None:
    r1 = ExtractedReport(
        transcript="Test: pothole on test street",
        category="pothole",
        severity="medium",
        specific_location="Test St near 1st",
        duration="",
        tags=["affects_commuters"],
        impact_summary="Synthetic test pothole report.",
        confidence=0.8,
    )
    r2 = ExtractedReport(
        transcript="Test: streetlight at test and 2nd",
        category="streetlight",
        severity="high",
        specific_location="Test St and 2nd",
        duration="two weeks",
        tags=["near_school"],
        impact_summary="Synthetic test streetlight report.",
        confidence=0.9,
    )

    inserted1 = await db.insert_report(lat=37.77, lng=-122.41, report=r1)
    inserted2 = await db.insert_report(lat=37.78, lng=-122.42, report=r2)
    print(f"Inserted ids: {inserted1.id}  {inserted2.id}")

    fetched = await db.get_report(inserted1.id)
    assert fetched is not None, "get_report returned None for just-inserted id"
    assert fetched.report["category"] == "pothole"
    print(f"get_report round-trip ok: {fetched.id} category={fetched.report['category']}")

    all_reports = await db.list_reports(limit=10)
    assert len(all_reports) >= 2, f"expected at least 2 rows, got {len(all_reports)}"
    assert all_reports[0].created_at >= all_reports[1].created_at, "list_reports not sorted DESC"
    print(f"list_reports returned {len(all_reports)} rows, DESC sort ok")

    potholes = await db.list_reports(category="pothole", limit=10)
    assert all(r.report["category"] == "pothole" for r in potholes), "category filter leaked non-potholes"
    print(f"category=pothole filter: {len(potholes)} rows, all pothole ✓")

    in_bbox = await db.list_reports(bbox=(-122.425, 37.775, -122.415, 37.785))
    assert all(-122.425 <= r.location.lng <= -122.415 for r in in_bbox), "bbox lng filter wrong"
    print(f"bbox filter: {len(in_bbox)} rows")

    connected = await db.check_connection()
    print(f"check_connection: {connected}")

    print("\nall db round-trip checks passed ✓")


if __name__ == "__main__":
    asyncio.run(main())
