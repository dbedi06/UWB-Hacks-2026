# VoiceMap

#### By Leonid Kotok (leonikot@uw.edu), Abenezer Desta (aben3@uw.edu), Jad Masri (masrjad@uw.edu), and Dilshan Bedi (dbedi@uw.edu)

> Voice your neighborhood's problems. We pin them on the map and alert nearby.

VoiceMap is a civic incident-reporting app: residents speak (or type) what's broken in their area, and the issue lands as a pin on a live map. AI handles transcription, structured extraction, content moderation, and semantic deduplication. Subscribers get SMS / WhatsApp / email when new reports drop into their watch radius. Admins can fire an AI-summarized digest to City Hall on demand.

Built for the UWB Hacks 2026 hackathon.

---

## Features

### Reporting

- **Voice or manual entry.** Hold the record button (press-and-hold with pointer-event capture so it works the same on touch and mouse) to dictate a report; release and the audio goes to FastAPI for Whisper transcription + GPT-4o structured extraction. Or type the form directly.
- **AI fills the form.** After voice extraction, the report panel opens pre-filled with the AI's title / category / severity / impact summary. The user reviews, edits anything that's off, optionally attaches a photo, then submits.
- **Image attachments.** Cloudinary unsigned uploads via the browser; URL is stored on the row.
- **Anonymous-friendly.** A `voicemap_session_token` UUID in `localStorage` lets people post without an account. Auth0 sign-in is available for users who want a persistent identity.
- **Emergency / crime warnings.** Voice extraction sets `is_crime` / `severity='emergency'` flags; the app interrupts with a "call 911 first" / "report to police" confirmation before submitting.

### AI moderation gate

Every submission passes through a `gpt-4o-mini` content gate before INSERT. Heavy bias toward allow — the gate only blocks obvious spam, joke entries, hate speech, sexual content, and targeted harassment of named private individuals. Profanity-as-venting, ESL/typos, terse one-word reports, and angry all-caps are explicitly allowed. Reject returns HTTP 422 with a friendly reason; the submission never lands in the DB.

### Map UX

- **Live updating.** Pin list re-fetches every 10 seconds while the tab is visible (paused when hidden, immediate catch-up on return). Reports submitted by other devices appear within 10 seconds without a refresh.
- **Severity-driven coloring.** Single pins and cluster pins both colored by severity (low → teal, medium → yellow, high → orange, emergency → red). Clusters take the color of the worst severity inside them.
- **Semantic deduplication.** When a new report is filed, `gpt-4o-mini` checks the 5 nearest reports within 100m and decides if it's a re-report of an existing incident. Matched reports attach to the same `cluster_id` and the pin shows a count badge instead of two stacked pins.
- **Image preservation through clusters.** When a cluster's most-recent report has no photo but an earlier one does, the pin still shows the photo via SQL `FIRST_VALUE` coalesce.
- **"You are here" pin.** Browser geolocation drops a pulsing blue dot at the user's location.
- **Country-wide zoom range.** `minZoom: 4` so users can pan from city level out to country level cleanly. Tile-wrap disabled.
- **Live alert-radius preview.** Opening the Alerts panel draws a teal dashed circle on the map showing the configured radius. Updates immediately when you toggle 0.25 / 0.5 / 1 / 2 / 5 mi.

### Subscriptions and notifications

- **Geographic watch areas.** Subscribers register a (lat, lng, radius, optional severity floor, optional category filter). When a report posts inside any matching area, the dispatcher fires.
- **Three channels.** Each subscription picks SMS, email, or both:
  - **SMS** via Twilio (E.164 recipient validation, GSM-7 body to fit one segment).
  - **WhatsApp sandbox** via the same Twilio API — set `TWILIO_WHATSAPP_FROM=whatsapp:+14155238886` and skip US toll-free verification entirely. Recipients send `join <sandbox-word>` once to opt in.
  - **Email** via AWS SES with a dark-themed HTML template (severity badge, Google Maps deep-link, unsubscribe footer).
- **Per-recipient deduplication.** If a phone or email matches multiple subscriptions for the same report (e.g. "home" + "work" both cover the location, or two duplicate Subscribe clicks), exactly one message goes out per recipient. Suppressed dupes are still logged in the `notifications` audit table.
- **Subscribe-time dedup too.** POST `/api/subscriptions` returns the existing row's id when `(phone+email+lat+lng+radius)` already exists.
- **Fail-open dispatch.** Twilio or SES failures don't break report submission. Each attempt is logged to `notifications` with `status='sent'|'failed'`.

### City Hall digest (admin-only)

A "Send now" button in the Alerts panel compiles the last 24 hours of cluster heads into a structured email and sends it to a configured City Hall address:

- AI exec summary (2–3 sentences, `gpt-4o-mini`, fail-open).
- Severity × category breakdown table.
- Top-5 priorities ranked by `(severity, report_count, recency)` with location and Google Maps deep-link.
- Counts are computed deterministically in JS — only the prose summary touches the LLM.

Gated behind `ADMIN_EMAILS` allowlist (env var). Non-admins don't see the button; the server enforces 401/403 even if the UI is bypassed.

### Authentication

- **Auth0 v4** with `Auth0Client` middleware. Routes mounted automatically: `/auth/login`, `/auth/logout`, `/auth/callback`, `/auth/profile`, `/auth/access-token`.
- **Auth0 → Neon sync** via a post-login Action calling `/api/auth/sync` with a shared bearer secret (`AUTH0_SYNC_SECRET`). Upserts a `users` row by email so the app can carry display name / contact prefs.
- **Anonymous reports still work** — sign-in is optional except for the admin digest button.

### Mobile / PWA

- Below 768px, the sidebar collapses into a slide-over drawer with a hamburger toggle and a tap-to-dismiss backdrop.
- `100dvh` viewport so iOS Safari's bottom URL bar doesn't cover the zoom controls.
- Web App Manifest + apple-touch-icon + status-bar styling so users can "Add to Home Screen" and launch full-screen with the brand-colored app icon.
- `env(safe-area-inset-*)` applied to all top-positioned floating buttons (hamburger, alerts, lightbox close) and Leaflet's bottom controls so they clear notches and home indicators.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 16 (App Router, Turbopack), React 19 |
| Map | Leaflet 1.9 + leaflet.markercluster (dark Carto basemap) |
| Backend (voice) | FastAPI + uvicorn (Python 3.13) |
| DB | Neon (Postgres 16 serverless), `@neondatabase/serverless` driver |
| Auth | Auth0 (`@auth0/nextjs-auth0` v4) |
| AI | OpenAI: GPT-4o (extraction), gpt-4o-mini (moderation, dedup, digest summary), Whisper (transcription) |
| SMS / WhatsApp | Twilio REST API (no SDK — native `fetch`) |
| Email | AWS SES (`@aws-sdk/client-ses`) |
| Images | Cloudinary unsigned uploads |
| Styling | Inline styles + Tailwind 4 (Tailwind installed but UI is mostly inline-styled) |

---

## Architecture

```
                       ┌──────────────────────────────────────────────┐
                       │  Browser  (Next.js client + Leaflet)         │
                       └────┬───────────────────────────┬─────────────┘
                            │ voice (audio blob)        │ JSON / form data
                            ▼                           ▼
            ┌─────────────────────────┐      ┌──────────────────────┐
            │   FastAPI :8000         │      │  Next.js :3000       │
            │   /api/submit-report    │      │  /api/reports        │ ◄─── moderation gate
            │   - Whisper             │      │  /api/subscriptions  │       (gpt-4o-mini)
            │   - GPT-4o extraction   │      │  /api/digest (admin) │ ◄─── dedup gate
            └────────────┬────────────┘      │  /api/me             │       (gpt-4o-mini)
                         │ structured        │  /auth/[auth0]       │
                         │ ExtractedReport   └──────┬───────────────┘
                         ▼                          │
                  Browser fills form ───POST───────►│
                                                    │
              ┌─────────────────────────────────────┴─────────┐
              │                                               │
              ▼                                               ▼
       ┌───────────┐                         ┌─────────────────────────┐
       │  Neon DB  │ ◄────── cluster query  │  fire-and-forget        │
       │           │                         │  dispatchSubscriberAlerts│
       │  reports  │                         │  - SMS via Twilio       │
       │  subs     │                         │  - email via AWS SES    │
       │  notif.   │ ◄────── audit log ──────┤  - WhatsApp via Twilio  │
       │  users    │                         └─────────────────────────┘
       └───────────┘
```

### Key code paths

- `components/VoiceMap.jsx` — single ~1600-line client component that runs the whole UI. Map init, recording, form, alerts panel, polling, drawer, all here.
- `app/api/reports/route.js` — POST runs moderation + dedup in parallel via `Promise.all`, INSERTs the report, fires `dispatchSubscriberAlerts` async. GET aggregates cluster heads with `FIRST_VALUE` window-functions for image carry-through.
- `app/api/subscriptions/route.js` — POST/DELETE; per-channel validation, tuple dedup.
- `app/api/digest/route.js` — admin-gated POST that runs `lib/digest.runDigest`.
- `lib/sms.js` / `lib/email.js` — minimal HTTP wrappers around Twilio + SES; native fetch + AWS SDK respectively.
- `lib/subscribers.js` — `dispatchSubscriberAlerts(sql, report)` runs both channel queries in parallel, dedups by recipient, fans out via `Promise.allSettled`, logs to `notifications`.
- `lib/cluster.js` — `findDuplicateCluster(sql, input)`: 100m Haversine + gpt-4o-mini judgment.
- `lib/moderation.js` — `moderateReport({title, description, category, tags})`: lexical pre-check + LLM gate.
- `lib/digest.js` — `runDigest(sql, opts)`: window query, JS stats, AI summary, HTML render, SES send.
- `lib/admin.js` — `getAdminSession()`: reads Auth0 session, checks email against `ADMIN_EMAILS`.
- `middleware.js` — Auth0 middleware that mounts `/auth/*` routes.
- `ai/extraction.py` — Whisper + GPT-4o pipeline producing `ExtractedReport` (Pydantic).
- `backend/main.py` — FastAPI entrypoint with CORS regex allowing `*.trycloudflare.com` / `*.ngrok.app` for tunneled dev.

---

## Running locally

### 0. Prerequisites

- Node 20+
- Python 3.13 (for the FastAPI voice backend; older 3.11+ should also work)
- A Neon Postgres database
- API keys: OpenAI, Auth0 application, Cloudinary unsigned upload preset, Twilio account (for SMS / WhatsApp), AWS SES with a verified sender (for email)

### 1. Clone and install dependencies

```bash
git clone https://github.com/dbedi06/UWB-Hacks-2026.git
cd UWB-Hacks-2026
npm install
```

If npm complains about peer-dep mismatches with `@auth0/nextjs-auth0`, use `npm install --legacy-peer-deps`.

### 2. Set up the Python venv for the voice backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cd ..
```

### 3. Apply DB migrations

The repo includes the schema and incremental migrations in `DB/`. Easiest path: paste each into the [Neon SQL editor](https://console.neon.tech) in order:

1. `DB/schemav2.sql` — base schema (users, reports, subscriptions, notifications, clusters, enums, indexes, severity stored procs).
2. `DB/002_add_image_url.sql` — adds `reports.image_url`.
3. `DB/003_contact_email.sql` — adds `subscriptions.contact_email` + updated CHECK constraint.

(There's also `DB/003_subscription_contacts_and_notifications.sql` from a separate branch with the queue-based notification system. **Don't run that one** — this branch dispatches notifications inline, not via the queue.)

### 4. Create `.env.local` in the repo root

Next.js automatically loads this. Replace each `<...>` with your own value.

```env
# Database
DATABASE_URL=postgresql://<user>:<pass>@<host>/<dbname>?sslmode=require

# OpenAI (used by moderation, dedup, digest summary, extraction)
OPENAI_API_KEY=sk-proj-...
OPENAI_DEDUP_MODEL=gpt-4o-mini       # optional override
OPENAI_MODERATION_MODEL=gpt-4o-mini   # optional override
OPENAI_DIGEST_MODEL=gpt-4o-mini       # optional override

# Voice backend (FastAPI). For local dev: http://localhost:8000.
# For tunneled dev (cloudflared / ngrok), set this to the public URL.
NEXT_PUBLIC_VOICEMAP_BACKEND=http://localhost:8000

# Public URL of the frontend itself — embedded in SMS / email bodies as a link.
VOICEMAP_PUBLIC_URL=http://localhost:3000

# Cloudinary (unsigned uploads from the browser)
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=<your-cloud>
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=<your-unsigned-preset>

# Twilio (SMS — leave WHATSAPP_FROM unset for plain SMS)
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=<your-twilio-auth-token>
TWILIO_FROM_NUMBER=+1...
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886   # Twilio sandbox; remove for SMS

# AWS SES (email)
AWS_REGION=us-west-2
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=<your-aws-secret>
SES_FROM=<your-verified-ses-sender>@example.com

# Auth0 (v4)
AUTH0_SECRET=<openssl rand -hex 32>
APP_BASE_URL=http://localhost:3000
AUTH0_DOMAIN=<your-tenant>.us.auth0.com
AUTH0_CLIENT_ID=<your-app-client-id>
AUTH0_CLIENT_SECRET=<your-app-client-secret>
AUTH0_SYNC_SECRET=<random-string-shared-with-Auth0-Action>

# Admin gating + digest recipient
ADMIN_EMAILS=admin@example.com,you@example.com
DIGEST_RECIPIENT_EMAIL=cityhall@example.com
```

### 5. Create `backend/.env`

The Python backend reads its own `.env` (loaded by `ai/config.py`).

```env
OPENAI_API_KEY=<same key as above>
ALLOWED_ORIGIN_REGEX=https://([a-z0-9-]+\.)?(trycloudflare\.com|ngrok-free\.app|ngrok\.app|ngrok\.io)
```

`ALLOWED_ORIGIN_REGEX` is only needed if you're tunneling the frontend through cloudflared / ngrok — `ALLOWED_ORIGINS` defaults to `http://localhost:3000` which covers the local dev case.

### 6. Configure Auth0

In the Auth0 dashboard, **Applications → your app → Settings**:

- **Application Type**: Regular Web Application (not SPA — v4 uses server-side auth-code-with-PKCE).
- **Allowed Callback URLs**: `http://localhost:3000/auth/callback` (and your tunnel URL `+ /auth/callback` if applicable).
- **Allowed Logout URLs**: `http://localhost:3000` (and your tunnel URL).

If you want post-login user sync to Neon, also configure an Auth0 Action that POSTs to `${APP_BASE_URL}/api/auth/sync` with header `Authorization: Bearer ${AUTH0_SYNC_SECRET}` and a body of `{ email, name, sub }`.

### 7. Run the servers

Two terminals:

**Terminal 1 — voice backend (Python / FastAPI):**

```bash
source backend/venv/bin/activate
uvicorn backend.main:app --reload --port 8000
```

You should see `Application startup complete.`. Hit `http://localhost:8000/api/health` to confirm — it should return `{"ok":true,"openai":"reachable","db":"reachable"}`.

**Terminal 2 — frontend (Next.js):**

```bash
npm run dev
```

You should see `Ready in 8XXms`. Open `http://localhost:3000`.

### 8. (Optional) Public tunnels for phone testing

Install `cloudflared` and run:

```bash
cloudflared tunnel --url http://localhost:3000
cloudflared tunnel --url http://localhost:8000
```

Update `NEXT_PUBLIC_VOICEMAP_BACKEND`, `VOICEMAP_PUBLIC_URL`, and `APP_BASE_URL` in `.env.local` to the new URLs (and update Auth0 dashboard's allowed callback / logout URLs to match). Restart Next.js so it bakes the new client-side env into the bundle.

---

## Verifying it works

After starting both servers, run through:

1. **Open the map.** Browser prompts for geolocation. The blue "you are here" dot appears.
2. **Click anywhere on the map.** The submit panel opens. Type a quick title + description, pick a severity, optionally attach an image, click **Submit Report**. A pin appears within ~1 second.
3. **Hold the voice button** on the form. Speak a description ("There's a huge pothole on Main Street that almost wrecked my car"). Release. The form re-fills with the AI's extraction. Edit if needed, hit Submit.
4. **Open the Alerts panel.** Pick SMS, enter a verified Twilio phone number, set a 1-mile radius, **Subscribe**.
5. **Submit a report inside that radius.** Within 10 seconds, the SMS arrives.
6. **(Admin) Open the Alerts panel** while signed in as a `ADMIN_EMAILS` user. Click **📨 City Hall digest → Send now**. Within ~5 seconds, an HTML email lands in `DIGEST_RECIPIENT_EMAIL`'s inbox with the AI summary, severity table, and top 5 priorities.

Check the dev server log for moderation / dispatch outcomes:

```
[moderation] reject session=... cat=spam title="..."
[notify] sms 1/1, email 1/1 for report=...
[digest] sent to=... clusters=56 reports=63 msg=...
```

---

## Project layout

```
.
├── ai/                       # Python: Whisper + GPT-4o extraction
│   ├── extraction.py
│   ├── prompts/extract.py
│   └── models.py             # Pydantic ExtractedReport
├── backend/                  # FastAPI voice service
│   ├── main.py
│   ├── config.py             # CORS regex, env loading
│   └── services/db.py        # JSON-file sample store (mostly unused now)
├── DB/                       # Schema and migrations (apply via Neon SQL editor)
│   ├── schemav2.sql
│   ├── 002_add_image_url.sql
│   └── 003_contact_email.sql
├── app/                      # Next.js App Router
│   ├── api/
│   │   ├── reports/route.js
│   │   ├── subscriptions/route.js
│   │   ├── digest/route.js   # admin-gated digest
│   │   ├── me/route.js       # returns is_admin flag
│   │   └── auth/             # Auth0 + sync endpoint
│   ├── layout.js             # Auth0Provider + PWA meta
│   ├── page.js               # mounts <VoiceMap />
│   ├── manifest.js           # /manifest.webmanifest for PWA install
│   └── globals.css           # safe-area-inset on Leaflet bottom controls
├── components/
│   └── VoiceMap.jsx          # the whole UI (~1600 lines)
├── lib/
│   ├── auth0.js              # Auth0Client singleton
│   ├── admin.js              # ADMIN_EMAILS gating + getAdminSession
│   ├── cluster.js            # findDuplicateCluster (semantic dedup)
│   ├── moderation.js         # moderateReport (content gate)
│   ├── subscribers.js        # dispatchSubscriberAlerts (SMS + email fan-out)
│   ├── sms.js                # Twilio HTTP wrapper
│   ├── email.js              # AWS SES wrapper + HTML template
│   ├── digest.js             # runDigest: query + AI summary + email
│   ├── reports.js            # buildReportDescription, severity mapping, parseUuid
│   └── db.js                 # Neon client lazy init
├── middleware.js             # Auth0 middleware (mounts /auth/*)
└── public/icons/             # PWA icons (192/512/180/32)
```

---

## Operating notes

- **Twilio trial accounts** can only message phones that are pre-verified as Caller IDs. Verify your demo phones in the Twilio console before testing real SMS delivery. WhatsApp sandbox sidesteps this — recipients send `join <sandbox-word>` once.
- **AWS SES sandbox mode** restricts sends to verified recipient email addresses until you request production access. The `voicemap` IAM user needs `ses:SendEmail` permission on the verified identity.
- **Cloudinary unsigned upload preset** must be configured in the Cloudinary console — Settings → Upload → Add upload preset → Signing mode: Unsigned.
- **Cloudflare quick tunnels rotate URLs on every restart.** When you restart `cloudflared tunnel --url http://localhost:3000`, the old URL is dead. Update `APP_BASE_URL` / `VOICEMAP_PUBLIC_URL` / `NEXT_PUBLIC_VOICEMAP_BACKEND` in `.env.local`, restart Next.js, and update Auth0's Allowed Callback URLs.
- **Admin allowlist updates need a Next.js restart** since `ADMIN_EMAILS` is read from `process.env`. To add an admin without a restart, add a `users.is_admin` column and read from there instead.

---

## Acknowledgements

Built at UWB Hacks 2026 by the VoiceMap team. Map tiles by [CARTO](https://carto.com/). Voice transcription by [OpenAI Whisper](https://openai.com/research/whisper). Cluster pin rendering courtesy of [leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster).
