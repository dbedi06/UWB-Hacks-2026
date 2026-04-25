# VoiceMap Backend

FastAPI service that turns voice recordings into structured civic-issue reports. Pairs with the AI extraction pipeline at [../ai/](../ai/) and (eventually) a Neon Postgres database.

## Quick start

From the repo root:

```bash
# 1. Install
python3 -m venv backend/venv
source backend/venv/bin/activate
pip install -r backend/requirements.txt

# 2. Configure
cp backend/.env.example backend/.env
# edit backend/.env and paste your OPENAI_API_KEY

# 3. Run
uvicorn backend.main:app --reload --port 8000
```

Verify with:

```bash
curl http://localhost:8000/api/health
# => {"ok":true,"openai":"reachable","db":"reachable"}
```

## Project layout

```
backend/
├── main.py                      FastAPI app, route definitions
├── config.py                    backend env vars (paths, CORS, audio limits)
├── models.py                    API response models (ReportResponse, etc.)
├── services/
│   └── db.py                    JSON file store (Supabase/Neon-compatible row shape)
├── mocks/
│   └── sample_reports.py        canned ExtractedReports for x-mock: true
├── migrations/
│   └── 001_initial.sql          Postgres DDL (apply to Neon when ready)
├── tests/
│   ├── test_db_smoke.py         JSON store round-trip
│   └── test_audio.py            Whisper + GPT-4o end-to-end
└── data/
    └── reports.json             local store (gitignored)
```

The OpenAI extraction pipeline is a separate package at [../ai/](../ai/). Backend imports `ai.extraction` for audio handling.

## Endpoints

Base URL: `http://localhost:8000`

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | liveness + DB reachability |
| POST | `/api/submit-report` | audio + GPS → stored report |
| GET | `/api/reports` | list (with filters) |
| GET | `/api/reports/{id}` | single report by id |

### `POST /api/submit-report`

Multipart form:

| Field | Type | Required | Notes |
|---|---|---|---|
| `audio` | file | yes | webm / mp4 / m4a / ogg / wav / mpeg, max 5 MB |
| `lat` | float | yes | -90..90 |
| `lng` | float | yes | -180..180 |

Headers:
- `x-mock: true` (optional) — bypass OpenAI and return a canned sample. Useful for demo-day resilience.

Success response (200):

```json
{
  "id": "<uuid>",
  "transcript": "There is a broken street light at Oak and 5th...",
  "report": {
    "category": "streetlight",
    "severity": "medium",
    "specific_location": "Oak and 5th",
    "duration": "3 weeks",
    "tags": ["near_school"],
    "impact_summary": "Resident reports...",
    "confidence": 0.9
  },
  "location": { "lat": 37.7749, "lng": -122.4194, "resolved_from_text": false },
  "created_at": "2026-04-24T23:29:10.211313+00:00",
  "status": "open",
  "cluster_id": null
}
```

Error responses share the shape `{"error": "...", "code": "..."}`:

| Status | code | When |
|---|---|---|
| 400 | `audio_too_short` | recording < 1 KB or transcript < 5 chars |
| 400 | `audio_too_large` | file > 5 MB |
| 400 | `invalid_location` | lat/lng out of range |
| 400 | `invalid_bbox` | `bbox` query param malformed |
| 404 | `not_found` | report id not present |
| 500 | `extraction_failed` | OpenAI returned an error |
| 500 | `db_write_failed` / `db_read_failed` | local JSON store failed |

### `GET /api/reports`

Query params (all optional):

| Param | Type | Default | Description |
|---|---|---|---|
| `limit` | int | 500 | capped at 1000 |
| `since` | ISO 8601 string | — | only rows created at or after |
| `category` | string | — | filter to one category |
| `bbox` | `minLng,minLat,maxLng,maxLat` | — | bounding box filter |

## Mock mode

When the `x-mock: true` header is present (or `MOCK_MODE=true` is set in `.env`), `submit-report` skips OpenAI entirely and returns one of three canned samples from [mocks/sample_reports.py](mocks/sample_reports.py). Critical for demo-day resilience — if OpenAI is slow or rate-limited, you still drop a pin with realistic-looking data.

## Testing

```bash
source backend/venv/bin/activate

# Prompt only (no audio, no FastAPI, no DB) — fastest iteration loop
python -m ai.tests.test_prompt_only

# JSON store round-trip
python -m backend.tests.test_db_smoke

# Real audio (drop sample_voice.m4a in backend/tests/fixtures/ first)
python -m backend.tests.test_audio
```

Android phone recordings sometimes come out as 3GP wrapped in `.mp4` (Whisper rejects them). Remux to a real M4A without re-encoding:

```bash
ffmpeg -i your_recording.mp4 -c:a copy backend/tests/fixtures/sample_voice.m4a
```

## Swapping the JSON store for Neon Postgres

The JSON file store at [services/db.py](services/db.py) is interim. Row shape on disk matches [migrations/001_initial.sql](migrations/001_initial.sql) exactly, so the cutover is a localised change.

1. Apply the migration to Neon — paste [migrations/001_initial.sql](migrations/001_initial.sql) into the Neon SQL editor (or `psql "$DATABASE_URL" -f migrations/001_initial.sql`).
2. Add `asyncpg` to [requirements.txt](requirements.txt).
3. In [services/db.py](services/db.py), replace the `_load` / `_save_atomic` helpers with an `asyncpg` pool. Keep the four public functions (`insert_report`, `get_report`, `list_reports`, `check_connection`) and their signatures. The row dict each function builds already maps 1:1 to the `reports` table columns.
4. Add to `.env`: `DATABASE_URL=postgres://user:pass@ep-xxx.neon.tech/voicemap`. Drop `REPORTS_JSON_PATH`.

`backend/main.py`, `backend/models.py`, and `ai/*` need zero changes.

## Frontend integration notes (for Jad)

- The frontend currently builds reports client-side (`components/VoiceMap.jsx:240` `submitReport`). To wire to the backend, replace the local `setReports` call with `fetch('http://localhost:8000/api/submit-report', { method: 'POST', body: formData })` where `formData` carries `audio`, `lat`, `lng`.
- Audio: `MediaRecorder` produces `audio/webm` on Chrome/Firefox and `audio/mp4` on Safari — both are accepted, no client-side conversion needed.
- CORS: edit `ALLOWED_ORIGINS` in `backend/.env` to include the frontend dev URL (default already covers `http://localhost:3000` and `http://localhost:5173`).
- The response includes `severity`. When it's `"emergency"`, show the "call 911" modal **before** dropping the pin.
- The `report` object contains `impact_summary` (one-sentence, third-person). Use that as the pin's display title — your component currently uses a separate `form.title` field; for voice submissions you can drop that field and use `impact_summary` directly, or take the first sentence of `transcript`.
