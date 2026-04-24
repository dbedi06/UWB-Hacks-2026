# 🗺️ VoiceMap
**Turn individual complaints into collective action.**

VoiceMap is a civic infrastructure reporting platform where community members can submit issues (potholes, broken streetlights, unsafe crosswalks, etc.) via text and photo. AI clusters overlapping reports into structured, prioritized issue cards — then surfaces them on a live map for both residents and city officials to act on.

---

## 🚀 Features

- **Report Submission** — Submit infrastructure issues with text descriptions, photos, and automatic geolocation
- **AI-Powered Clustering** — Google Gemini groups nearby, related reports into single confirmed issue cards with severity scores
- **Live Issue Map** — Color-coded map pins showing active issues by severity, updated in real time
- **Two-Tier Output** — A public community map and auto-generated reports for the relevant city department
- **Alert Subscriptions** — Get SMS/email notifications when new issues appear near a location you care about
- **Emergency Routing** — Severity-flagged reports trigger a prompt to call 911 rather than routing through the app

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js |
| Map | Leaflet.js / Mapbox |
| Backend | Node.js (REST API) |
| Database | DigitalOcean Managed PostgreSQL |
| AI | Google Gemini (text extraction + vision) |
| Notifications | Twilio (SMS) / SendGrid (email) |
| Hosting | Vercel (frontend), Render (backend) |

---

## 📁 Project Structure

```
voicemap/
├── frontend/        # Next.js app, map UI, submission form
├── backend/         # REST API, auth, notification logic
├── ai/              # Gemini pipeline, clustering logic
└── README.md
```

---

## ⚙️ Getting Started

### Prerequisites
- Node.js v18+
- A DigitalOcean PostgreSQL database
- Google Gemini API key
- Twilio or SendGrid account (for notifications)

### Installation

```bash
# Clone the repo
git clone https://github.com/your-org/voicemap.git
cd voicemap

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Fill in your API keys and DB connection string

# Run locally
npm run dev
```

### Environment Variables

```bash
GEMINI_API_KEY=your-gemini-api-key
DATABASE_URL=your-digitalocean-postgres-url
TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-token
NEXT_PUBLIC_MAPBOX_TOKEN=your-mapbox-token   # if using Mapbox
```

---

## 🗄️ Data Model (Overview)

| Table | Purpose |
|---|---|
| `users` | Registered accounts |
| `reports` | Raw individual submissions |
| `clusters` | AI-merged issue groups shown on the map |
| `subscriptions` | Alert preferences per user |

---

## 👥 Team

| Name | Role |
|---|---|
| **Jad** | Frontend & Map |
| **Abenezer** | Backend, Database & Notifications |
| **Leo** | AI Pipeline & LLM Integration |
| **Dilshan** | Pitch, Demo & Full-Stack Support |

---

## 📄 License

MIT
