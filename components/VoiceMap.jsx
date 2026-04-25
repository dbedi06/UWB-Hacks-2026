"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { parseUuid } from "@/lib/reports";

// ─── Session token ────────────────────────────────────────────────────────────
const SESSION_KEY = "voicemap_session_token";

function ensureSessionToken() {
  if (typeof window === "undefined") return null;
  let t = localStorage.getItem(SESSION_KEY);
  if (!t || !parseUuid(t)) {
    t = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, t);
  }
  return t;
}

// ─── Backend URL ──────────────────────────────────────────────────────────────
const VOICEMAP_BACKEND = process.env.NEXT_PUBLIC_VOICEMAP_BACKEND || "http://localhost:8000";

// ─── Category / severity config ───────────────────────────────────────────────
const CATEGORIES = {
  pothole: { label: "Pothole", color: "#E07B39", icon: "🕳️" },
  streetlight: { label: "Streetlight", color: "#F5C842", icon: "💡" },
  crosswalk: { label: "Crosswalk", color: "#4A9EE0", icon: "🚶" },
  graffiti: { label: "Graffiti", color: "#9B6DD6", icon: "🎨" },
  flooding: { label: "Flooding", color: "#3BBFA3", icon: "💧" },
  debris: { label: "Debris/Hazard", color: "#D45F5F", icon: "⚠️" },
  other: { label: "Other", color: "#8A8A8A", icon: "📍" },
};

const SEVERITIES = {
  low: { label: "Low", color: "#3BBFA3", ring: 8 },
  medium: { label: "Medium", color: "#F5C842", ring: 11 },
  high: { label: "High", color: "#E07B39", ring: 14 },
  emergency: { label: "Emergency", color: "#D45F5F", ring: 18 },
};

// Status drives pin color. closed = null means excluded from map.
const STATUS_COLOR = {
  active: "#D45F5F",
  pending: "#F5C842",
  closed: null,
};

const STATUS_LABEL = {
  active: "🔴 Active",
  pending: "🟡 Pending fix",
  closed: "✅ Closed",
};

const BOTHELL_CENTER = [47.7623, -122.2054];

// ─── Seeded demo reports ──────────────────────────────────────────────────────
const SEED_REPORTS = [
  { id: "s1", lat: 47.7651, lng: -122.2048, category: "pothole", severity: "high", status: "active", report_count: 4, title: "Large pothole on 228th St SE", location_description: "47.76510, -122.20480", impact_summary: "Dangerous for cyclists and vehicles, near school zone.", created_at: "2025-04-20T08:12:00Z" },
  { id: "s2", lat: 47.7602, lng: -122.2071, category: "streetlight", severity: "medium", status: "pending", report_count: 2, title: "Streetlight out at Main St & 102nd Ave", location_description: "47.76020, -122.20710", impact_summary: "Dark intersection, residents concerned about safety at night.", created_at: "2025-04-21T19:45:00Z" },
  { id: "s3", lat: 47.7588, lng: -122.2010, category: "crosswalk", severity: "high", status: "active", report_count: 6, title: "Faded crosswalk on Bothell Way NE", location_description: "47.75880, -122.20100", impact_summary: "Nearly invisible markings, kids cross daily for school.", created_at: "2025-04-18T07:30:00Z" },
  { id: "s4", lat: 47.7671, lng: -122.2090, category: "flooding", severity: "medium", status: "pending", report_count: 3, title: "Drainage backup near Canyon Park", location_description: "47.76710, -122.20900", impact_summary: "Standing water after rain, blocks sidewalk access.", created_at: "2025-04-22T11:00:00Z" },
  { id: "s5", lat: 47.7634, lng: -122.1988, category: "debris", severity: "low", status: "active", report_count: 1, title: "Tree branch on bike path", location_description: "47.76340, -122.19880", impact_summary: "Fallen limb partially blocks trail near Sammamish River.", created_at: "2025-04-23T15:20:00Z" },
  { id: "s6", lat: 47.7558, lng: -122.2055, category: "graffiti", severity: "low", status: "pending", report_count: 1, title: "Graffiti on underpass wall", location_description: "47.75580, -122.20550", impact_summary: "Spray paint on SR-522 underpass, visible from roadway.", created_at: "2025-04-19T09:00:00Z" },
  { id: "s7", lat: 47.7700, lng: -122.2035, category: "pothole", severity: "medium", status: "active", report_count: 3, title: "Pothole cluster on 240th St", location_description: "47.77000, -122.20350", impact_summary: "Multiple potholes, reported by 3 residents.", created_at: "2025-04-17T14:00:00Z" },
  { id: "s8", lat: 47.7615, lng: -122.2120, category: "streetlight", severity: "high", status: "active", report_count: 5, title: "3 streetlights out on 195th Pl NE", location_description: "47.76150, -122.21200", impact_summary: "Entire block dark, break-ins reported nearby.", created_at: "2025-04-20T20:10:00Z" },
  { id: "s9", lat: 47.7645, lng: -122.1965, category: "crosswalk", severity: "medium", status: "pending", report_count: 2, title: "No crosswalk signal at trail crossing", location_description: "47.76450, -122.19650", impact_summary: "Pedestrians crossing SR-522 with no signal protection.", created_at: "2025-04-21T08:45:00Z" },
  { id: "s10", lat: 47.7580, lng: -122.2095, category: "debris", severity: "high", status: "active", report_count: 2, title: "Shopping cart blocking storm drain", location_description: "47.75800, -122.20950", impact_summary: "Drain fully blocked, flooding risk during rain.", created_at: "2025-04-22T16:30:00Z" },
  { id: "s11", lat: 47.7722, lng: -122.2070, category: "pothole", severity: "low", status: "pending", report_count: 1, title: "Small pothole on 244th St SE", location_description: "47.77220, -122.20700", impact_summary: "Minor but growing, reported before winter.", created_at: "2025-04-16T10:00:00Z" },
  { id: "s12", lat: 47.7596, lng: -122.1999, category: "flooding", severity: "high", status: "active", report_count: 7, title: "Intersection floods every rainstorm", location_description: "47.75960, -122.19990", impact_summary: "Corner of Bothell Way & 102nd Ave NE, cars stall.", created_at: "2025-04-15T13:20:00Z" },
];

// ─── Pin SVG ─────────────────────────────────────────────────────────────────
// Color is driven by status (active/pending); count badge from friends' version.
function createPinSVG(category, severity, status, count = null) {
  const cat = CATEGORIES[category] || CATEGORIES.other;
  const sev = SEVERITIES[severity] || SEVERITIES.low;
  const color = STATUS_COLOR[status] ?? STATUS_COLOR.active;
  const r = sev.ring;
  const total = r * 2 + 6;
  const cx = total / 2;

  const countBadge = count > 1 ? `
    <circle cx="${total - 6}" cy="6" r="7" fill="#1a1a2e" stroke="white" stroke-width="1.5"/>
    <text x="${total - 6}" y="6" text-anchor="middle" dominant-baseline="central" fill="white" font-size="8" font-family="monospace" font-weight="bold">${count}</text>
  ` : "";

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="${total + 10}" viewBox="0 0 ${total} ${total + 10}">
      <circle cx="${cx}" cy="${cx}" r="${r}"     fill="${color}" fill-opacity="0.2" stroke="${color}" stroke-width="1.5"/>
      <circle cx="${cx}" cy="${cx}" r="${r - 4}" fill="${color}" fill-opacity="0.9"/>
      <text x="${cx}" y="${cx}" text-anchor="middle" dominant-baseline="central" font-size="${r - 2}">${cat.icon}</text>
      <line x1="${cx}" y1="${cx + r - 2}" x2="${cx}" y2="${total + 8}" stroke="${color}" stroke-width="1.5" stroke-opacity="0.6"/>
      ${countBadge}
    </svg>`;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function VoiceMap() {
  const leafletRef = useRef(null);
  const tileLayerRef = useRef(null);
  const markersRef = useRef({});
  const clusterRef = useRef(null);       // markercluster group for all pins
  const userRef = useRef(null);
  const recognitionRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const isDraggingRef = useRef(false);   // drag-vs-click fix

  // ── UI state ──────────────────────────────────────────────────────────────
  const [darkMode, setDarkMode] = useState(true);
  const [reports, setReports] = useState(SEED_REPORTS);
  const [selected, setSelected] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [form, setForm] = useState({ title: "", category: "pothole", other_type: "", severity: "medium", impact_summary: "" });
  const [clickedLatLng, setClickedLatLng] = useState(null);
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [filter, setFilter] = useState({ category: "all", severity: "all" });
  const [mapReady, setMapReady] = useState(false);

  // ── Alert state ───────────────────────────────────────────────────────────
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [geoLocation, setGeoLocation] = useState(null);
  const [geoError, setGeoError] = useState(false);
  const [alertPrefs, setAlertPrefs] = useState({ enabled: false, radius: 1, minSeverity: "medium" });

  // ── Auth state ────────────────────────────────────────────────────────────
  const [user, setUser] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ username: "", password: "", email: "", phone: "" });
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // ── Report submission state (from friends' version) ───────────────────────
  const [reportError, setReportError] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);

  useEffect(() => { userRef.current = user; }, [user]);

  // ─── Theme ────────────────────────────────────────────────────────────────
  const T = darkMode ? {
    pageBg: "#0d1117", sidebar: "#111827", card: "#1f2937", border: "#1f2937", border2: "#374151",
    text: "#e8e8e8", textMuted: "#6b7280", textDim: "#4b5563", textFaint: "#9ca3af",
    tiles: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  } : {
    pageBg: "#f0f4f8", sidebar: "#ffffff", card: "#e8edf2", border: "#e2e8f0", border2: "#cbd5e1",
    text: "#0f172a", textMuted: "#64748b", textDim: "#94a3b8", textFaint: "#64748b",
    tiles: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  };

  // Swap tile layer on theme change
  useEffect(() => { if (tileLayerRef.current) tileLayerRef.current.setUrl(T.tiles); }, [darkMode]);

  // ─── Auth handlers ────────────────────────────────────────────────────────
  const handleLogin = async () => {
    if (!authForm.username || !authForm.password) { setAuthError("Please enter your username and password."); return; }
    setAuthLoading(true); setAuthError("");
    try {
      // ── BACKEND HOOK: uncomment when ready ──
      // const res  = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: authForm.username, password: authForm.password }) });
      // const data = await res.json();
      // if (!res.ok) throw new Error(data.message || "Login failed");
      // setUser(data.user); // expects { id, username, email, phone, token }

      // ── MOCK — remove when backend is ready ──
      await new Promise(r => setTimeout(r, 600));
      setUser({ id: "u1", username: authForm.username, email: authForm.email || "", phone: authForm.phone || "" });
      setAuthOpen(false);
      setAuthForm({ username: "", password: "", email: "", phone: "" });
    } catch (e) { setAuthError(e.message); }
    finally { setAuthLoading(false); }
  };

  const handleSignup = async () => {
    if (!authForm.username || !authForm.password) { setAuthError("Username and password are required."); return; }
    if (!authForm.email && !authForm.phone) { setAuthError("Please provide at least an email or phone number."); return; }
    setAuthLoading(true); setAuthError("");
    try {
      // ── BACKEND HOOK: uncomment when ready ──
      // const res  = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: authForm.username, password: authForm.password, email: authForm.email || null, phone: authForm.phone || null }) });
      // const data = await res.json();
      // if (!res.ok) throw new Error(data.message || "Signup failed");
      // setUser(data.user);

      // ── MOCK — remove when backend is ready ──
      await new Promise(r => setTimeout(r, 600));
      setUser({ id: "u1", username: authForm.username, email: authForm.email, phone: authForm.phone });
      setAuthOpen(false);
      setAuthForm({ username: "", password: "", email: "", phone: "" });
    } catch (e) { setAuthError(e.message); }
    finally { setAuthLoading(false); }
  };

  const handleLogout = () => setUser(null);

  // ─── Geolocation ──────────────────────────────────────────────────────────
  const requestGeolocation = () => {
    if (!navigator.geolocation) { setGeoError(true); return; }
    navigator.geolocation.getCurrentPosition(
      pos => { setGeoLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGeoError(false); },
      () => setGeoError(true)
    );
  };
  useEffect(() => { if (alertsOpen && !geoLocation) requestGeolocation(); }, [alertsOpen]);

  // ─── Fetch live reports on mount (falls back to seed data) ───────────────
  // Maps DB field names + enum values → what the UI expects
  const normalizeStatus = (s) => {
    if (!s) return "active";
    const v = String(s).toLowerCase().trim();
    if (v === "pending") return "pending";
    if (v === "resolved" || v === "dismissed") return "closed";
    return "active"; // "active" passes through
  };

  const normalizeSeverity = (s) => {
    if (!s) return "medium";
    const v = String(s).toLowerCase().trim();
    if (v === "moderate") return "medium";
    if (v === "low" || v === "high" || v === "emergency") return v;
    return "medium";
  };

  const normalizeReport = (r) => ({
    id: r.id,
    lat: r.lat,
    lng: r.lng,
    category: r.category || "other",
    severity: normalizeSeverity(r.severity),
    status: normalizeStatus(r.status),
    title: r.title || r.description || "Untitled report",
    impact_summary: r.impact_summary || r.description || "",
    report_count: r.report_count || 1,
    created_at: r.created_at || r.reported_at || new Date().toISOString(),
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    (async () => {
      try {
        const res = await fetch("/api/reports");
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.reports)) {
          setReports(data.reports.map(normalizeReport));
        }
      } catch { /* keep seed data when API unavailable */ }
    })();
  }, []);

  // ─── Load Leaflet ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined" || leafletRef.current) return;

    // Leaflet base CSS + JS, then markercluster CSS + JS chained on top.
    const cssHrefs = [
      "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
      "https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css",
      "https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css",
    ];
    cssHrefs.forEach((href) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      document.head.appendChild(link);
    });

    const leafletScript = document.createElement("script");
    leafletScript.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    leafletScript.onload = () => {
      // markercluster depends on Leaflet — load it after Leaflet finishes
      const mcScript = document.createElement("script");
      mcScript.src = "https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js";
      mcScript.onload = () => initMap();
      document.head.appendChild(mcScript);
    };
    document.head.appendChild(leafletScript);
  }, []);

  const initMap = useCallback(() => {
    const L = window.L;
    const map = L.map("voicemap-container", { center: BOTHELL_CENTER, zoom: 14, zoomControl: false });

    const tl = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(map);
    tileLayerRef.current = tl;

    L.control.zoom({ position: "bottomright" }).addTo(map);

    // Drag-vs-click fix
    map.on("dragstart", () => { isDraggingRef.current = true; });
    map.on("dragend", () => { setTimeout(() => { isDraggingRef.current = false; }, 50); });

    map.on("click", e => {
      if (isDraggingRef.current) return;
      setSelected(null); // always clear selected card when clicking map
      if (!userRef.current) { setAuthOpen(true); setAuthMode("login"); return; }
      setClickedLatLng({ lat: e.latlng.lat, lng: e.latlng.lng });
      setPanelOpen(true);
      setTranscript("");
      setForm({ title: "", category: "pothole", other_type: "", severity: "medium", impact_summary: "" });
    });

    // Cluster group: nearby pins collapse into a single counted icon. Single
    // pins still render as their own SVG. Cluster icon uses the dominant
    // category's color so the dark-themed map stays consistent.
    const cluster = L.markerClusterGroup({
      maxClusterRadius: 40,
      showCoverageOnHover: true,
      spiderfyOnMaxZoom: true,
      iconCreateFunction: (c) => {
        const count = c.getChildCount();
        const cats = c.getAllChildMarkers().map(m => m._report?.category).filter(Boolean);
        const tally = {};
        cats.forEach(cat => { tally[cat] = (tally[cat] || 0) + 1; });
        const dominant = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0];
        const color = (CATEGORIES[dominant] || CATEGORIES.other).color;
        return L.divIcon({
          html: `<div style="background:${color};color:white;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #1a1a2e;box-shadow:0 0 12px rgba(0,0,0,0.6);font-family:'DM Mono',monospace;font-weight:600;font-size:13px">${count}</div>`,
          className: "vm-cluster",
          iconSize: [40, 40],
        });
      },
    });
    map.addLayer(cluster);
    clusterRef.current = cluster;

    leafletRef.current = map;
    setMapReady(true);
  }, []);

  // ─── Render markers ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !leafletRef.current || !clusterRef.current) return;
    const L = window.L;
    const cluster = clusterRef.current;

    cluster.clearLayers();
    markersRef.current = {};

    reports
      .filter(r =>
        r.status !== "closed" &&
        (filter.category === "all" || r.category === filter.category) &&
        (filter.severity === "all" || r.severity === filter.severity)
      )
      .forEach(report => {
        const sev = SEVERITIES[report.severity] || SEVERITIES.low;
        const size = sev.ring * 2 + 6;
        const icon = L.divIcon({
          html: createPinSVG(report.category, report.severity, report.status, report.report_count),
          className: "",
          iconSize: [size, size + 10],
          iconAnchor: [size / 2, size + 10],
        });
        const marker = L.marker([report.lat, report.lng], { icon })
          .on("click", e => {
            L.DomEvent.stopPropagation(e);
            setSelected(report);
          });
        marker._report = report; // used by cluster iconCreateFunction
        cluster.addLayer(marker);
        markersRef.current[report.id] = marker;
      });
  }, [reports, filter, mapReady]);

  // ─── Voice recording ──────────────────────────────────────────────────────
  // Captures raw audio for FastAPI (Whisper + GPT-4o) while also using Web
  // Speech API for a live transcript preview in the UI.
  const startRecording = async () => {
    setRecording(true);
    setTranscript("");

    // Raw audio capture for FastAPI pipeline
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size) audioChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: mr.mimeType });
        await submitVoiceReport(audioBlob, mr.mimeType);
      };
      mr.start();
      mediaRecorderRef.current = mr;
    } catch (e) {
      console.error("Microphone unavailable:", e);
    }

    // Web Speech API — live transcript display only
    if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      const rec = new SR();
      rec.continuous = false;
      rec.interimResults = true;
      rec.lang = "en-US";
      rec.onresult = e => setTranscript(Array.from(e.results).map(r => r[0].transcript).join(" "));
      rec.onend = () => setRecording(false);
      rec.start();
      recognitionRef.current = rec;
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current) recognitionRef.current.stop();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop(); // triggers mr.onstop → submitVoiceReport
    }
    setRecording(false);
  };

  // ─── FastAPI voice pipeline ───────────────────────────────────────────────
  const submitVoiceReport = async (audioBlob, mimeType) => {
    if (!clickedLatLng) return;
    setIsProcessing(true);

    // Step 1: send audio to FastAPI for Whisper + GPT-4o extraction
    const fd = new FormData();
    fd.append("audio", audioBlob, `recording.${mimeType.includes("mp4") ? "m4a" : "webm"}`);
    fd.append("lat", String(clickedLatLng.lat));
    fd.append("lng", String(clickedLatLng.lng));

    let ai;
    try {
      const aiRes = await fetch(`${VOICEMAP_BACKEND}/api/submit-report`, { method: "POST", body: fd });
      if (!aiRes.ok) {
        const err = await aiRes.json().catch(() => ({}));
        alert(err.error || "AI extraction failed");
        setIsProcessing(false);
        return;
      }
      ai = await aiRes.json();
    } catch (e) {
      alert("Could not reach the voice backend.");
      setIsProcessing(false);
      return;
    }

    setTranscript(ai.transcript);

    // Step 2: emergency / crime check
    if (ai.report.severity === "emergency") {
      if (!window.confirm("⚠️ This sounds like an emergency. Please call 911 first.\n\nLog as a non-emergency report anyway?")) {
        setIsProcessing(false);
        return;
      }
    } else if (ai.report.is_crime) {
      if (!window.confirm("🚓 This sounds like a crime. Please consider reporting it to the police — call 911 if it's in progress, or your local non-emergency police line if it's already happened.\n\nLog this report on the map as well?")) {
        setIsProcessing(false);
        return;
      }
    }

    // Step 3: low-confidence confirmation
    if (ai.report.confidence < 0.7) {
      if (!window.confirm(`I heard: "${ai.transcript}"\n\nDoes that look right?`)) {
        setIsProcessing(false);
        return;
      }
    }

    // Step 4: persist via Next.js /api/reports (same endpoint as manual form)
    const sessionToken = ensureSessionToken();
    const body = {
      lat: ai.location.lat,
      lng: ai.location.lng,
      title: ai.report.title,
      category: ai.report.category,
      severity: ai.report.severity,
      impactSummary: ai.report.impact_summary,
      transcript: ai.transcript,
      tags: ai.report.tags,
      confidence: ai.report.confidence,
      duration: ai.report.duration,
      sessionToken,
      userId: parseUuid(userRef.current?.id) ?? undefined,
    };

    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Failed to save report.");
        setIsProcessing(false);
        return;
      }
      const { report } = await res.json();
      setReports(prev => [...prev, report]);
      setSelected(report);
      setPanelOpen(false);
      setClickedLatLng(null);
    } catch {
      // Fallback local pin if /api/reports isn't wired yet
      const localReport = {
        id: `r-${Date.now()}`,
        lat: ai.location.lat,
        lng: ai.location.lng,
        category: ai.report.category,
        severity: ai.report.severity,
        status: "active",
        title: ai.report.impact_summary,
        location_description: `${ai.location.lat.toFixed(5)}, ${ai.location.lng.toFixed(5)}`,
        impact_summary: ai.report.impact_summary,
        report_count: 1,
        created_at: new Date().toISOString(),
      };
      setReports(prev => [...prev, localReport]);
      setSelected(localReport);
      setPanelOpen(false);
      setClickedLatLng(null);
    } finally {
      setIsProcessing(false);
    }
  };

  // ─── Manual form submission ───────────────────────────────────────────────
  const submitReport = async () => {
    if (!clickedLatLng || !form.impact_summary.trim()) return;

    const sessionToken = ensureSessionToken();
    if (!parseUuid(sessionToken)) {
      setReportError("Session not ready. Please refresh the page.");
      return;
    }

    if (form.severity === "emergency") {
      if (!window.confirm("⚠️ This sounds like an emergency. Please call 911 first.\n\nDo you still want to log this as a non-emergency report for city records?")) return;
    }

    setReportSubmitting(true);
    setReportError("");

    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: clickedLatLng.lat,
          lng: clickedLatLng.lng,
          title: form.impact_summary.trim(),
          category: form.category,
          severity: form.severity,
          impactSummary: form.impact_summary.trim(),
          transcript: transcript || undefined,
          sessionToken,
          userId: parseUuid(user?.id) ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save report");
      const newReport = data.report;
      if (!newReport) throw new Error("Invalid response from server");
      setReports(prev => [...prev, normalizeReport(newReport)]);
      setPanelOpen(false);
      setSelected(newReport);
      setClickedLatLng(null);
    } catch (e) {
      // Fallback: drop local pin if backend isn't wired yet
      const localReport = {
        id: `r-${Date.now()}`,
        lat: clickedLatLng.lat,
        lng: clickedLatLng.lng,
        category: form.category,
        severity: form.severity,
        status: "active",
        title: form.impact_summary.trim(),
        location_description: `${clickedLatLng.lat.toFixed(5)}, ${clickedLatLng.lng.toFixed(5)}`,
        impact_summary: form.impact_summary.trim(),
        report_count: 1,
        created_at: new Date().toISOString(),
      };
      setReports(prev => [...prev, localReport]);
      setPanelOpen(false);
      setSelected(localReport);
      setClickedLatLng(null);
      // Only surface genuine errors (not the fallback path)
      if (e.message !== "Failed to fetch") setReportError(e.message);
    } finally {
      setReportSubmitting(false);
    }
  };

  // ─── Derived helpers ──────────────────────────────────────────────────────
  const cat = selected ? (CATEGORIES[selected.category] || CATEGORIES.other) : null;
  const sev = selected ? (SEVERITIES[selected.severity] || SEVERITIES.low) : null;

  const inputStyle = {
    background: T.card, border: `1px solid ${T.border2}`, borderRadius: 8,
    color: T.text, fontSize: 13, padding: "10px 12px", outline: "none",
    fontFamily: "'DM Sans', sans-serif",
  };
  const modalBox = {
    width: "100%", background: T.sidebar, borderRadius: 16,
    border: `1px solid ${T.border}`, padding: 28,
    boxShadow: "0 24px 64px rgba(0,0,0,0.8)", animation: "slideUp 0.25s ease",
  };
  const closeBtn = {
    background: T.card, border: "none", borderRadius: 6,
    color: T.textFaint, fontSize: 16, cursor: "pointer", padding: "4px 10px",
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "'DM Sans', sans-serif", background: T.pageBg, color: T.text, position: "relative", overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
        @keyframes slideUp { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
        ::-webkit-scrollbar { width: 4px }
        ::-webkit-scrollbar-track { background: transparent }
        ::-webkit-scrollbar-thumb { background: ${T.border2}; border-radius: 4px }
      `}</style>

      {/* ── Sidebar ──────────────────────────────────────────────── */}
      <aside style={{ width: 260, background: T.sidebar, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", zIndex: 10, flexShrink: 0 }}>

        {/* Logo */}
        <div style={{ padding: "20px 20px 16px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, background: "linear-gradient(135deg, #3BBFA3, #4A9EE0)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>📍</div>
            <div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 16, fontWeight: 500, letterSpacing: "-0.02em", color: T.text }}>VoiceMap</div>
              <div style={{ fontSize: 10, color: T.textMuted, letterSpacing: "0.08em", textTransform: "uppercase" }}>Bothell, WA</div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.border}`, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[
            { label: "Total", value: reports.reduce((s, r) => s + (r.report_count || 1), 0) },
            { label: "Active", value: reports.filter(r => r.status === "active").length },
          ].map(s => (
            <div key={s.label} style={{ background: T.card, borderRadius: 8, padding: "8px 10px" }}>
              <div style={{ fontSize: 20, fontWeight: 600, fontFamily: "'DM Mono', monospace", color: T.text }}>{s.value}</div>
              <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Status legend */}
        <div style={{ padding: "10px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", gap: 12 }}>
          {Object.entries(STATUS_COLOR).filter(([, c]) => c !== null).map(([k, c]) => (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: c }} />
              <span style={{ fontSize: 11, color: T.textMuted, textTransform: "capitalize" }}>{k}</span>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 10, color: T.textMuted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>Filter</div>
          <select value={filter.category} onChange={e => setFilter(f => ({ ...f, category: e.target.value }))}
            style={{ width: "100%", background: T.card, border: `1px solid ${T.border2}`, borderRadius: 6, color: T.text, fontSize: 12, padding: "6px 8px", marginBottom: 6, outline: "none" }}>
            <option value="all">All categories</option>
            {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
          </select>
          <select value={filter.severity} onChange={e => setFilter(f => ({ ...f, severity: e.target.value }))}
            style={{ width: "100%", background: T.card, border: `1px solid ${T.border2}`, borderRadius: 6, color: T.text, fontSize: 12, padding: "6px 8px", outline: "none" }}>
            <option value="all">All severities</option>
            {Object.entries(SEVERITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>

        {/* Report list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {reports
            .filter(r =>
              (filter.category === "all" || r.category === filter.category) &&
              (filter.severity === "all" || r.severity === filter.severity)
            )
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .map(r => {
              const c = CATEGORIES[r.category] || CATEGORIES.other;
              const s = SEVERITIES[r.severity] || SEVERITIES.low;
              const sc = STATUS_COLOR[r.status] || STATUS_COLOR.active;
              const isActive = selected?.id === r.id;
              return (
                <div key={r.id}
                  onClick={() => { setSelected(r); leafletRef.current?.flyTo([r.lat, r.lng], 16, { duration: 0.8 }); }}
                  style={{ padding: "10px 16px", cursor: "pointer", borderLeft: `3px solid ${isActive ? sc : "transparent"}`, background: isActive ? T.card : "transparent", transition: "all 0.15s" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                    <span style={{ fontSize: 13 }}>{c.icon}</span>
                    <span style={{ fontSize: 12, fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: T.text }}>{r.title}</span>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", background: sc + "22", color: sc, borderRadius: 3, padding: "1px 5px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{r.status}</span>
                    <span style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", background: s.color + "22", color: s.color, borderRadius: 3, padding: "1px 5px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{r.severity}</span>
                    <span style={{ fontSize: 10, color: T.textMuted }}>{new Date(r.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              );
            })}
        </div>

        {/* Auth footer */}
        <div style={{ padding: "12px 16px", borderTop: `1px solid ${T.border}` }}>
          {user ? (
            <div>
              <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 8, lineHeight: 1.5 }}>
                Signed in as <span style={{ color: T.text, fontWeight: 500 }}>{user.username}</span>. Click the map to report.
              </div>
              <button onClick={handleLogout}
                style={{ width: "100%", padding: "8px", borderRadius: 6, border: `1px solid ${T.border2}`, background: "transparent", color: T.textMuted, fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                Sign out
              </button>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: 11, color: T.textDim, margin: "0 0 10px", lineHeight: 1.5 }}>Sign in to report issues or subscribe to alerts.</p>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => { setAuthMode("login"); setAuthOpen(true); setAuthError(""); }}
                  style={{ flex: 1, padding: "8px", borderRadius: 6, border: `1px solid ${T.border2}`, background: T.card, color: T.text, fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}>
                  Sign in
                </button>
                <button onClick={() => { setAuthMode("signup"); setAuthOpen(true); setAuthError(""); }}
                  style={{ flex: 1, padding: "8px", borderRadius: 6, border: "none", background: "linear-gradient(135deg, #3BBFA3, #4A9EE0)", color: "#fff", fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>
                  Sign up
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ── Map ───────────────────────────────────────────────────── */}
      <div id="voicemap-container" style={{ flex: 1, position: "relative" }} />

      {/* ── Alerts button ─────────────────────────────────────────── */}
      <button
        onClick={() => { if (!user) { setAuthMode("login"); setAuthOpen(true); setAuthError(""); } else setAlertsOpen(true); }}
        style={{ position: "absolute", top: 20, right: 20, zIndex: 1000, background: T.sidebar, border: `1px solid ${T.border2}`, borderRadius: 8, color: T.text, fontSize: 13, fontWeight: 600, padding: "10px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.3)", fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s" }}
        onMouseEnter={e => e.currentTarget.style.borderColor = "#3BBFA3"}
        onMouseLeave={e => e.currentTarget.style.borderColor = T.border2}
      >
        🔔 Alerts
      </button>

      {/* ── Dark / Light toggle ────────────────────────────────────── */}
      <button
        onClick={() => setDarkMode(d => !d)}
        title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
        style={{ position: "absolute", bottom: 100, right: 12, zIndex: 1000, width: 52, height: 28, borderRadius: 14, border: `1px solid ${T.border2}`, background: darkMode ? "#1f2937" : "#e2e8f0", cursor: "pointer", padding: 0, transition: "all 0.25s", display: "flex", alignItems: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.25)" }}
      >
        <span style={{ position: "absolute", left: darkMode ? 6 : "auto", right: darkMode ? "auto" : 6, fontSize: 11, lineHeight: 1, transition: "all 0.2s", userSelect: "none" }}>
          {darkMode ? "🌙" : "☀️"}
        </span>
        <span style={{ position: "absolute", width: 20, height: 20, borderRadius: "50%", background: darkMode ? "#3BBFA3" : "#fff", left: darkMode ? 26 : 4, boxShadow: "0 1px 4px rgba(0,0,0,0.3)", transition: "all 0.25s" }} />
      </button>

      {/* ── Selected issue card ───────────────────────────────────── */}
      {selected && !panelOpen && (
        <div style={{ position: "absolute", bottom: 32, right: 32, width: 320, background: T.sidebar, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20, zIndex: 1000, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", animation: "slideUp 0.2s ease" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 20 }}>{cat?.icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3, color: T.text }}>{selected.title}</div>
                <div style={{ fontSize: 11, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{cat?.label}</div>
              </div>
            </div>
            <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", color: T.textMuted, fontSize: 18, cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
          </div>

          <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", background: (STATUS_COLOR[selected.status] ?? "#8A8A8A") + "22", color: STATUS_COLOR[selected.status] ?? "#8A8A8A", borderRadius: 4, padding: "3px 8px", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
              {STATUS_LABEL[selected.status] || selected.status}
            </span>
            <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", background: sev?.color + "22", color: sev?.color, borderRadius: 4, padding: "3px 8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {selected.severity}
            </span>
            <span style={{ fontSize: 10, color: T.textMuted, padding: "3px 0" }}>{new Date(selected.created_at).toLocaleString()}</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, padding: "6px 10px", background: T.card, borderRadius: 6 }}>
            <span style={{ fontSize: 13 }}>📊</span>
            <span style={{ fontSize: 12, color: T.textMuted }}>
              <span style={{ color: T.text, fontWeight: 600, fontFamily: "'DM Mono', monospace" }}>{selected.report_count}</span>
              {" "}report{selected.report_count !== 1 ? "s" : ""} submitted
            </span>
          </div>

          {selected.impact_summary && (
            <p style={{ fontSize: 12, color: T.textFaint, lineHeight: 1.6, margin: "0 0 12px", borderLeft: `2px solid ${cat?.color}50`, paddingLeft: 10 }}>
              {selected.impact_summary}
            </p>
          )}
          <div style={{ fontSize: 10, color: T.textDim, fontFamily: "'DM Mono', monospace" }}>
            {selected.lat.toFixed(5)}, {selected.lng.toFixed(5)}
          </div>
        </div>
      )}

      {/* ── Auth modal ────────────────────────────────────────────── */}
      {authOpen && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 4000, padding: 24 }}>
          <div style={{ ...modalBox, maxWidth: 400 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: T.text }}>{authMode === "login" ? "Sign in to VoiceMap" : "Create an account"}</div>
                <div style={{ fontSize: 11, color: T.textMuted, marginTop: 3 }}>{authMode === "login" ? "Report issues and subscribe to alerts" : "Join your community on VoiceMap"}</div>
              </div>
              <button onClick={() => setAuthOpen(false)} style={closeBtn}>×</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input value={authForm.username} onChange={e => setAuthForm(f => ({ ...f, username: e.target.value }))} placeholder="Username" autoComplete="username" style={inputStyle} />
              <input value={authForm.password} onChange={e => setAuthForm(f => ({ ...f, password: e.target.value }))} placeholder="Password" type="password" autoComplete={authMode === "signup" ? "new-password" : "current-password"} style={inputStyle} />
              {authMode === "signup" && (
                <>
                  <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>Provide at least one contact method for alerts:</div>
                  <input value={authForm.email} onChange={e => setAuthForm(f => ({ ...f, email: e.target.value }))} placeholder="Email address (optional)" type="email" autoComplete="email" style={inputStyle} />
                  <input value={authForm.phone} onChange={e => setAuthForm(f => ({ ...f, phone: e.target.value }))} placeholder="Phone number (optional)" type="tel" autoComplete="tel" style={inputStyle} />
                </>
              )}
              {authError && (
                <div style={{ fontSize: 12, color: "#D45F5F", background: "#D45F5F11", border: "1px solid #D45F5F33", borderRadius: 6, padding: "8px 10px" }}>{authError}</div>
              )}
              <button onClick={authMode === "login" ? handleLogin : handleSignup} disabled={authLoading}
                style={{ marginTop: 4, padding: "12px", borderRadius: 8, border: "none", background: authLoading ? T.card : "linear-gradient(135deg, #3BBFA3, #4A9EE0)", color: authLoading ? T.textDim : "#fff", fontSize: 13, fontWeight: 600, cursor: authLoading ? "not-allowed" : "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s" }}>
                {authLoading ? "Please wait…" : authMode === "login" ? "Sign in →" : "Create account →"}
              </button>
              <div style={{ textAlign: "center", fontSize: 12, color: T.textMuted, marginTop: 4 }}>
                {authMode === "login" ? "Don't have an account? " : "Already have an account? "}
                <span onClick={() => { setAuthMode(authMode === "login" ? "signup" : "login"); setAuthError(""); }} style={{ color: "#3BBFA3", cursor: "pointer", fontWeight: 500 }}>
                  {authMode === "login" ? "Sign up" : "Sign in"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Alerts modal ──────────────────────────────────────────── */}
      {alertsOpen && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3000, padding: 24 }}>
          <div style={{ ...modalBox, maxWidth: 420 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: T.text }}>🔔 Alert Preferences</div>
                <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>Get notified about issues near you</div>
              </div>
              <button onClick={() => setAlertsOpen(false)} style={closeBtn}>×</button>
            </div>
            {geoError || !geoLocation ? (
              <div style={{ textAlign: "center", padding: "24px 0" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>📍</div>
                <div style={{ fontSize: 13, color: T.textFaint, marginBottom: 16, lineHeight: 1.6 }}>Please enable location permissions to use this feature.</div>
                <button onClick={requestGeolocation}
                  style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #3BBFA3", background: "#3BBFA322", color: "#3BBFA3", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                  Enable Location Access
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div style={{ fontSize: 11, color: "#3BBFA3", fontFamily: "'DM Mono', monospace", background: "#3BBFA311", borderRadius: 6, padding: "6px 10px" }}>
                  ✓ Location detected: {geoLocation.lat.toFixed(4)}, {geoLocation.lng.toFixed(4)}
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
                  <input type="checkbox" checked={alertPrefs.enabled} onChange={e => setAlertPrefs(p => ({ ...p, enabled: e.target.checked }))} style={{ width: 16, height: 16, accentColor: "#3BBFA3", cursor: "pointer" }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: T.text }}>Enable alerts</div>
                    <div style={{ fontSize: 11, color: T.textMuted }}>Receive notifications for new issues near you</div>
                  </div>
                </label>
                {alertPrefs.enabled && (
                  <>
                    <div>
                      <div style={{ fontSize: 11, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Alert radius</div>
                      <div style={{ display: "flex", gap: 8 }}>
                        {[0.25, 0.5, 1, 2, 5].map(r => (
                          <button key={r} onClick={() => setAlertPrefs(p => ({ ...p, radius: r }))}
                            style={{ flex: 1, padding: "8px 0", borderRadius: 6, fontSize: 11, fontWeight: 600, border: `1px solid ${alertPrefs.radius === r ? "#3BBFA3" : T.border2}`, background: alertPrefs.radius === r ? "#3BBFA322" : T.card, color: alertPrefs.radius === r ? "#3BBFA3" : T.textFaint, cursor: "pointer", fontFamily: "'DM Mono', monospace" }}>
                            {r}mi
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Minimum severity</div>
                      <div style={{ display: "flex", gap: 8 }}>
                        {Object.entries(SEVERITIES).map(([k, v]) => {
                          const active = alertPrefs.minSeverity === k;
                          return (
                            <button key={k} onClick={() => setAlertPrefs(p => ({ ...p, minSeverity: k }))}
                              style={{ flex: 1, padding: "8px 0", borderRadius: 6, fontSize: 11, fontWeight: 600, border: `1px solid ${active ? v.color : v.color + "44"}`, background: active ? v.color + "33" : T.card, color: v.color, cursor: "pointer", fontFamily: "'DM Mono', monospace" }}>
                              {v.label}
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ fontSize: 11, color: T.textMuted, marginTop: 6 }}>
                        Alerts for <span style={{ color: SEVERITIES[alertPrefs.minSeverity]?.color }}>{SEVERITIES[alertPrefs.minSeverity]?.label}</span> and above within <strong style={{ color: T.text }}>{alertPrefs.radius} mile{alertPrefs.radius !== 1 ? "s" : ""}</strong>.
                      </div>
                    </div>
                  </>
                )}
                <button onClick={() => setAlertsOpen(false)}
                  style={{ padding: "12px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #3BBFA3, #4A9EE0)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                  Save preferences
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Submit panel ──────────────────────────────────────────── */}
      {panelOpen && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 2000, padding: 24 }}>
          <div style={{ ...modalBox, maxWidth: 480, padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: T.text }}>Report an issue</div>
                {clickedLatLng && (
                  <div style={{ fontSize: 11, color: T.textMuted, fontFamily: "'DM Mono', monospace", marginTop: 2 }}>
                    {clickedLatLng.lat.toFixed(5)}, {clickedLatLng.lng.toFixed(5)}
                  </div>
                )}
              </div>
              <button onClick={() => setPanelOpen(false)} style={closeBtn}>×</button>
            </div>

            {/* Voice button */}
            <div style={{ marginBottom: 16 }}>
              <button
                onMouseDown={startRecording} onMouseUp={stopRecording}
                onTouchStart={startRecording} onTouchEnd={stopRecording}
                style={{ width: "100%", padding: "14px", borderRadius: 10, border: `2px solid ${recording ? "#3BBFA3" : T.border2}`, background: recording ? "#3BBFA322" : T.card, color: recording ? "#3BBFA3" : T.textFaint, fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, transition: "all 0.15s", fontFamily: "'DM Sans', sans-serif" }}
              >
                <span style={{ fontSize: 18 }}>{recording ? "🔴" : "🎙️"}</span>
                {recording ? "Recording… release to stop" : "Hold to record voice report"}
              </button>
              {isProcessing && (
                <div style={{ textAlign: "center", fontSize: 11, color: T.textMuted, marginTop: 8 }}>Parsing with AI…</div>
              )}
              {transcript && !recording && (
                <div style={{ marginTop: 8, padding: "8px 12px", background: T.card, borderRadius: 8, fontSize: 11, color: T.textFaint, lineHeight: 1.5, fontStyle: "italic" }}>
                  "{transcript}"
                </div>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{ flex: 1, height: 1, background: T.border }} />
              <span style={{ fontSize: 11, color: T.textDim }}>or type below</span>
              <div style={{ flex: 1, height: 1, background: T.border }} />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  style={{ ...inputStyle, fontSize: 12, padding: "10px" }}>
                  {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                </select>
                <select value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}
                  style={{ ...inputStyle, fontSize: 12, padding: "10px", border: `1px solid ${SEVERITIES[form.severity]?.color + "55" || T.border2}`, color: SEVERITIES[form.severity]?.color || T.text }}>
                  {Object.entries(SEVERITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <textarea
                value={form.impact_summary}
                onChange={e => setForm(f => ({ ...f, impact_summary: e.target.value }))}
                placeholder={form.category === "other"
                  ? "Describe the issue (e.g. 'Broken bench near the playground')"
                  : "Describe the issue (e.g. 'Broken streetlight at Oak & 5th, out for 2 weeks')"}
                rows={3}
                style={{ ...inputStyle, fontSize: 12, resize: "vertical", lineHeight: 1.5 }}
              />
              {form.severity === "emergency" && (
                <div style={{ background: "#D45F5F22", border: "1px solid #D45F5F55", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#D45F5F", display: "flex", gap: 8 }}>
                  <span>⚠️</span>
                  <span>If this is a life-threatening emergency, <strong>call 911 immediately</strong>. This app does not dispatch emergency services.</span>
                </div>
              )}
              {reportError && (
                <div style={{ fontSize: 12, color: "#D45F5F", lineHeight: 1.4 }}>{reportError}</div>
              )}
              <button
                onClick={submitReport}
                disabled={!form.impact_summary.trim() || reportSubmitting}
                style={{ padding: "12px", borderRadius: 8, border: "none", background: form.impact_summary.trim() && !reportSubmitting ? "linear-gradient(135deg, #3BBFA3, #4A9EE0)" : T.card, color: form.impact_summary.trim() && !reportSubmitting ? "#fff" : T.textDim, fontSize: 13, fontWeight: 600, cursor: form.impact_summary.trim() && !reportSubmitting ? "pointer" : "not-allowed", fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s" }}
              >
                {reportSubmitting ? "Saving…" : "Pin to map →"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}