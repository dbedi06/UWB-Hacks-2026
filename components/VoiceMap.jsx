"use client";

import { useEffect, useRef, useState, useCallback } from "react";

// ─── Category config ────────────────────────────────────────────────────────
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

// Bothell, WA center
const BOTHELL_CENTER = [47.7623, -122.2054];

// ─── Seeded demo reports ─────────────────────────────────────────────────────
const SEED_REPORTS = [
  { id: "s1", lat: 47.7651, lng: -122.2048, category: "pothole", severity: "high", title: "Large pothole on 228th St SE", location_description: "228th St SE near school zone", impact_summary: "Dangerous for cyclists and vehicles, near school zone.", report_count: 4, status: "open", created_at: "2025-04-20T08:12:00Z" },
  { id: "s2", lat: 47.7602, lng: -122.2071, category: "streetlight", severity: "medium", title: "Streetlight out at Main St & 102nd Ave", location_description: "Main St & 102nd Ave NE intersection", impact_summary: "Dark intersection, residents concerned about safety at night.", report_count: 2, status: "open", created_at: "2025-04-21T19:45:00Z" },
  { id: "s3", lat: 47.7588, lng: -122.2010, category: "crosswalk", severity: "high", title: "Faded crosswalk on Bothell Way NE", location_description: "Bothell Way NE near elementary school", impact_summary: "Nearly invisible markings, kids cross daily for school.", report_count: 6, status: "open", created_at: "2025-04-18T07:30:00Z" },
  { id: "s4", lat: 47.7671, lng: -122.2090, category: "flooding", severity: "medium", title: "Drainage backup near Canyon Park", location_description: "Canyon Park entrance, north parking lot", impact_summary: "Standing water after rain, blocks sidewalk access.", report_count: 3, status: "open", created_at: "2025-04-22T11:00:00Z" },
  { id: "s5", lat: 47.7634, lng: -122.1988, category: "debris", severity: "low", title: "Tree branch on bike path", location_description: "Sammamish River Trail, mile marker 7", impact_summary: "Fallen limb partially blocks trail near Sammamish River.", report_count: 1, status: "open", created_at: "2025-04-23T15:20:00Z" },
  { id: "s6", lat: 47.7558, lng: -122.2055, category: "graffiti", severity: "low", title: "Graffiti on underpass wall", location_description: "SR-522 underpass, westbound side", impact_summary: "Spray paint on SR-522 underpass, visible from roadway.", report_count: 1, status: "open", created_at: "2025-04-19T09:00:00Z" },
  { id: "s7", lat: 47.7700, lng: -122.2035, category: "pothole", severity: "medium", title: "Pothole cluster on 240th St", location_description: "240th St SE between 35th and 39th Ave", impact_summary: "Multiple potholes, reported by 3 residents.", report_count: 3, status: "open", created_at: "2025-04-17T14:00:00Z" },
  { id: "s8", lat: 47.7615, lng: -122.2120, category: "streetlight", severity: "high", title: "3 streetlights out on 195th Pl NE", location_description: "195th Pl NE, full block between 2nd and 4th", impact_summary: "Entire block dark, break-ins reported nearby.", report_count: 5, status: "open", created_at: "2025-04-20T20:10:00Z" },
  { id: "s9", lat: 47.7645, lng: -122.1965, category: "crosswalk", severity: "medium", title: "No crosswalk signal at trail crossing", location_description: "SR-522 trail crossing near Riverside Dr", impact_summary: "Pedestrians crossing SR-522 with no signal protection.", report_count: 2, status: "open", created_at: "2025-04-21T08:45:00Z" },
  { id: "s10", lat: 47.7580, lng: -122.2095, category: "debris", severity: "high", title: "Shopping cart blocking storm drain", location_description: "Storm drain on 98th Ave NE near QFC", impact_summary: "Drain fully blocked, flooding risk during rain.", report_count: 2, status: "open", created_at: "2025-04-22T16:30:00Z" },
  { id: "s11", lat: 47.7722, lng: -122.2070, category: "pothole", severity: "low", title: "Small pothole on 244th St SE", location_description: "244th St SE near cul-de-sac", impact_summary: "Minor but growing, reported before winter.", report_count: 1, status: "open", created_at: "2025-04-16T10:00:00Z" },
  { id: "s12", lat: 47.7596, lng: -122.1999, category: "flooding", severity: "high", title: "Intersection floods every rainstorm", location_description: "Bothell Way & 102nd Ave NE corner", impact_summary: "Corner of Bothell Way & 102nd Ave NE, cars stall.", report_count: 7, status: "open", created_at: "2025-04-15T13:20:00Z" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function createPinSVG(category, severity, count = null) {
  const cat = CATEGORIES[category] || CATEGORIES.other;
  const sev = SEVERITIES[severity] || SEVERITIES.low;
  const r = sev.ring;
  const total = r * 2 + 6;
  const cx = total / 2;

  const countBadge = count > 1 ? `
    <circle cx="${total - 6}" cy="6" r="7" fill="#1a1a2e" stroke="white" stroke-width="1.5"/>
    <text x="${total - 6}" y="6" text-anchor="middle" dominant-baseline="central" fill="white" font-size="8" font-family="monospace" font-weight="bold">${count}</text>
  ` : "";

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="${total + 10}" viewBox="0 0 ${total} ${total + 10}">
      <circle cx="${cx}" cy="${cx}" r="${r}" fill="${cat.color}" fill-opacity="0.2" stroke="${cat.color}" stroke-width="1.5"/>
      <circle cx="${cx}" cy="${cx}" r="${r - 4}" fill="${cat.color}" fill-opacity="0.9"/>
      <text x="${cx}" y="${cx}" text-anchor="middle" dominant-baseline="central" font-size="${r - 2}">${cat.icon}</text>
      <line x1="${cx}" y1="${cx + r - 2}" x2="${cx}" y2="${total + 8}" stroke="${cat.color}" stroke-width="1.5" stroke-opacity="0.6"/>
      ${countBadge}
    </svg>
  `;
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function VoiceMap() {
  const mapRef = useRef(null);
  const leafletRef = useRef(null);
  const markersRef = useRef({});
  const [reports, setReports] = useState(SEED_REPORTS);
  const [selected, setSelected] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [form, setForm] = useState({ title: "", category: "pothole", other_type: "", severity: "medium", location_description: "", impact_summary: "" });
  const [clickedLatLng, setClickedLatLng] = useState(null);
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [filter, setFilter] = useState({ category: "all", severity: "all" });
  const [mapReady, setMapReady] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [geoLocation, setGeoLocation] = useState(null);
  const [geoError, setGeoError] = useState(false);
  const [alertPrefs, setAlertPrefs] = useState({ enabled: false, radius: 1, minSeverity: "medium" });

  // ── Auth state ────────────────────────────────────────────────────────────
  const [user, setUser] = useState(null); // null = logged out
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login"); // "login" | "signup"
  const [authForm, setAuthForm] = useState({ username: "", password: "", email: "", phone: "" });
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const mediaRecorderRef = useRef(null);
  const recognitionRef = useRef(null);
  const userRef = useRef(null);
  useEffect(() => { userRef.current = user; }, [user]);

  // ── Auth handlers — swap fetch URLs for real backend endpoints ────────────
  const handleLogin = async () => {
    if (!authForm.username || !authForm.password) { setAuthError("Please enter your username and password."); return; }
    setAuthLoading(true); setAuthError("");
    try {
      // ── BACKEND HOOK: replace with real API call ──
      // const res = await fetch("/api/auth/login", {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify({ username: authForm.username, password: authForm.password }),
      // });
      // const data = await res.json();
      // if (!res.ok) throw new Error(data.message || "Login failed");
      // setUser(data.user);  // expects: { id, username, email, phone }

      // ── MOCK (remove when backend is ready) ──
      await new Promise(r => setTimeout(r, 600));
      setUser({ id: "u1", username: authForm.username, email: authForm.email || "", phone: authForm.phone || "" });
      setAuthOpen(false);
      setAuthForm({ username: "", password: "", email: "", phone: "" });
    } catch (e) {
      setAuthError(e.message);
    } finally { setAuthLoading(false); }
  };

  const handleSignup = async () => {
    if (!authForm.username || !authForm.password) { setAuthError("Username and password are required."); return; }
    if (!authForm.email && !authForm.phone) { setAuthError("Please provide at least an email or phone number."); return; }
    setAuthLoading(true); setAuthError("");
    try {
      // ── BACKEND HOOK: replace with real API call ──
      // const res = await fetch("/api/auth/register", {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify({
      //     username: authForm.username,
      //     password: authForm.password,
      //     email:    authForm.email || null,
      //     phone:    authForm.phone || null,
      //   }),
      // });
      // const data = await res.json();
      // if (!res.ok) throw new Error(data.message || "Signup failed");
      // setUser(data.user);  // expects: { id, username, email, phone }

      // ── MOCK (remove when backend is ready) ──
      await new Promise(r => setTimeout(r, 600));
      setUser({ id: "u1", username: authForm.username, email: authForm.email, phone: authForm.phone });
      setAuthOpen(false);
      setAuthForm({ username: "", password: "", email: "", phone: "" });
    } catch (e) {
      setAuthError(e.message);
    } finally { setAuthLoading(false); }
  };

  const handleLogout = () => { setUser(null); };

  const requestGeolocation = () => {
    if (!navigator.geolocation) { setGeoError(true); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { setGeoLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGeoError(false); },
      () => setGeoError(true)
    );
  };

  useEffect(() => { if (alertsOpen && !geoLocation) requestGeolocation(); }, [alertsOpen]);

  // ── Load Leaflet ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined" || leafletRef.current) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => initMap();
    document.head.appendChild(script);
  }, []);

  const initMap = useCallback(() => {
    const L = window.L;
    const map = L.map("voicemap-container", {
      center: BOTHELL_CENTER,
      zoom: 14,
      zoomControl: false,
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);

    map.on("click", (e) => {
      if (!userRef.current) { setAuthOpen(true); setAuthMode("login"); return; }
      setClickedLatLng({ lat: e.latlng.lat, lng: e.latlng.lng });
      setPanelOpen(true);
      setTranscript("");
      setForm({ title: "", category: "pothole", other_type: "", severity: "medium", location_description: "", impact_summary: "" });
    });

    leafletRef.current = map;
    setMapReady(true);
  }, []);

  // ── Render markers ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !leafletRef.current) return;
    const L = window.L;
    const map = leafletRef.current;

    // Clear existing
    Object.values(markersRef.current).forEach(m => map.removeLayer(m));
    markersRef.current = {};

    const filtered = reports.filter(r => {
      if (filter.category !== "all" && r.category !== filter.category) return false;
      if (filter.severity !== "all" && r.severity !== filter.severity) return false;
      return true;
    });

    filtered.forEach(report => {
      const svg = createPinSVG(report.category, report.severity);
      const sev = SEVERITIES[report.severity] || SEVERITIES.low;
      const size = (sev.ring * 2 + 6);

      const icon = L.divIcon({
        html: svg,
        className: "",
        iconSize: [size, size + 10],
        iconAnchor: [size / 2, size + 10],
      });

      const marker = L.marker([report.lat, report.lng], { icon })
        .addTo(map)
        .on("click", () => setSelected(report));

      markersRef.current[report.id] = marker;
    });
  }, [reports, filter, mapReady]);

  // ── Voice recording (Web Speech API fallback for demo) ────────────────────
  const startRecording = () => {
    setRecording(true);
    setTranscript("");

    if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SR();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (e) => {
        const t = Array.from(e.results).map(r => r[0].transcript).join(" ");
        setTranscript(t);
      };
      recognition.onend = () => {
        setRecording(false);
        parseTranscript();
      };
      recognition.start();
      recognitionRef.current = recognition;
    } else {
      // Simulate for browsers without Web Speech API
      setTimeout(() => {
        setTranscript("There's a broken streetlight at Main Street near the park, it's been out for two weeks.");
        setRecording(false);
      }, 2500);
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current) recognitionRef.current.stop();
    setRecording(false);
  };

  // ── LLM-style transcript parsing (rule-based for demo; swap for real API) ─
  const parseTranscript = useCallback(() => {
    if (!transcript) return;
    setIsProcessing(true);

    // Simple keyword extraction — replace with Anthropic API call in production
    setTimeout(() => {
      const t = transcript.toLowerCase();

      let category = "other";
      if (t.includes("pothole") || t.includes("hole in the road")) category = "pothole";
      else if (t.includes("streetlight") || t.includes("street light") || t.includes("light out")) category = "streetlight";
      else if (t.includes("crosswalk") || t.includes("cross walk")) category = "crosswalk";
      else if (t.includes("flood") || t.includes("water") || t.includes("drain")) category = "flooding";
      else if (t.includes("graffiti") || t.includes("spray paint") || t.includes("vandal")) category = "graffiti";
      else if (t.includes("debris") || t.includes("branch") || t.includes("tree") || t.includes("trash")) category = "debris";

      let severity = "medium";
      if (t.includes("emergency") || t.includes("urgent") || t.includes("danger") || t.includes("injured")) severity = "emergency";
      else if (t.includes("weeks") || t.includes("months") || t.includes("serious") || t.includes("bad")) severity = "high";
      else if (t.includes("minor") || t.includes("small") || t.includes("little")) severity = "low";

      // Extract a title from first clause
      const sentences = transcript.split(/[.,!?]/);
      const title = sentences[0]?.trim().slice(0, 80) || transcript.slice(0, 80);

      setForm(f => ({
        ...f,
        category,
        severity,
        title: title.charAt(0).toUpperCase() + title.slice(1),
        impact_summary: transcript,
      }));
      setIsProcessing(false);
    }, 800);
  }, [transcript]);

  useEffect(() => {
    if (!recording && transcript) parseTranscript();
  }, [recording, transcript, parseTranscript]);

  // ── Submit report ─────────────────────────────────────────────────────────
  const submitReport = () => {
    if (!clickedLatLng || !form.title.trim()) return;

    if (form.severity === "emergency") {
      if (!window.confirm("⚠️ This sounds like an emergency. Please call 911 first.\n\nDo you still want to log this as a non-emergency report for city records?")) return;
    }

    const newReport = {
      id: `r-${Date.now()}`,
      lat: clickedLatLng.lat,
      lng: clickedLatLng.lng,
      category: form.category,
      other_type: form.category === "other" ? form.other_type : undefined,
      severity: form.severity,         // set by AI on backend; user can hint via voice
      title: form.title,
      location_description: `${clickedLatLng.lat.toFixed(5)}, ${clickedLatLng.lng.toFixed(5)}`,
      impact_summary: form.impact_summary,
      report_count: 1,                 // backend will aggregate
      status: "open",                  // backend manages open/closed
      created_at: new Date().toISOString(),
    };

    setReports(prev => [...prev, newReport]);
    setPanelOpen(false);
    setSelected(newReport);
    setClickedLatLng(null);
  };

  // ── UI ────────────────────────────────────────────────────────────────────
  const cat = selected ? (CATEGORIES[selected.category] || CATEGORIES.other) : null;
  const sev = selected ? (SEVERITIES[selected.severity] || SEVERITIES.low) : null;
  const inputStyle = { background: "#1f2937", border: "1px solid #374151", borderRadius: 8, color: "#e8e8e8", fontSize: 13, padding: "10px 12px", outline: "none", fontFamily: "'DM Sans', sans-serif" };

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "'DM Sans', sans-serif", background: "#0d1117", color: "#e8e8e8", position: "relative", overflow: "hidden" }}>

      {/* ── Google Font ── */}
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');`}</style>

      {/* ── Left sidebar ─────────────────────────────────────────── */}
      <aside style={{ width: 260, background: "#111827", borderRight: "1px solid #1f2937", display: "flex", flexDirection: "column", zIndex: 10, flexShrink: 0 }}>
        {/* Logo */}
        <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid #1f2937" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, background: "linear-gradient(135deg, #3BBFA3, #4A9EE0)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>📍</div>
            <div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 16, fontWeight: 500, letterSpacing: "-0.02em" }}>VoiceMap</div>
              <div style={{ fontSize: 10, color: "#6b7280", letterSpacing: "0.08em", textTransform: "uppercase" }}>Bothell, WA</div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #1f2937", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[
            { label: "Total", value: reports.length },
            { label: "High+", value: reports.filter(r => r.severity === "high" || r.severity === "emergency").length },
          ].map(s => (
            <div key={s.label} style={{ background: "#1f2937", borderRadius: 8, padding: "8px 10px" }}>
              <div style={{ fontSize: 20, fontWeight: 600, fontFamily: "'DM Mono', monospace" }}>{s.value}</div>
              <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #1f2937" }}>
          <div style={{ fontSize: 10, color: "#6b7280", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>Filter</div>
          <select
            value={filter.category}
            onChange={e => setFilter(f => ({ ...f, category: e.target.value }))}
            style={{ width: "100%", background: "#1f2937", border: "1px solid #374151", borderRadius: 6, color: "#e8e8e8", fontSize: 12, padding: "6px 8px", marginBottom: 6, outline: "none" }}
          >
            <option value="all">All categories</option>
            {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
          </select>
          <select
            value={filter.severity}
            onChange={e => setFilter(f => ({ ...f, severity: e.target.value }))}
            style={{ width: "100%", background: "#1f2937", border: "1px solid #374151", borderRadius: 6, color: "#e8e8e8", fontSize: 12, padding: "6px 8px", outline: "none" }}
          >
            <option value="all">All severities</option>
            {Object.entries(SEVERITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>

        {/* Report list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {reports
            .filter(r => (filter.category === "all" || r.category === filter.category) && (filter.severity === "all" || r.severity === filter.severity))
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .map(r => {
              const c = CATEGORIES[r.category] || CATEGORIES.other;
              const s = SEVERITIES[r.severity] || SEVERITIES.low;
              const isActive = selected?.id === r.id;
              return (
                <div
                  key={r.id}
                  onClick={() => { setSelected(r); leafletRef.current?.flyTo([r.lat, r.lng], 16, { duration: 0.8 }); }}
                  style={{ padding: "10px 16px", cursor: "pointer", borderLeft: `3px solid ${isActive ? c.color : "transparent"}`, background: isActive ? "#1f2937" : "transparent", transition: "all 0.15s" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                    <span style={{ fontSize: 13 }}>{c.icon}</span>
                    <span style={{ fontSize: 12, fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</span>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", background: s.color + "22", color: s.color, borderRadius: 3, padding: "1px 5px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{r.severity}</span>
                    <span style={{ fontSize: 10, color: "#6b7280" }}>{new Date(r.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              );
            })}
        </div>

        {/* Bottom: auth or hint */}
        <div style={{ padding: "12px 16px", borderTop: "1px solid #1f2937" }}>
          {user ? (
            <div>
              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 8, lineHeight: 1.5 }}>
                Signed in as <span style={{ color: "#e8e8e8", fontWeight: 500 }}>{user.username}</span>. Click anywhere on the map to report an issue.
              </div>
              <button
                onClick={handleLogout}
                style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid #374151", background: "transparent", color: "#6b7280", fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
              >
                Sign out
              </button>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: 11, color: "#4b5563", margin: "0 0 10px", lineHeight: 1.5 }}>
                Sign in to report issues or subscribe to alerts.
              </p>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => { setAuthMode("login"); setAuthOpen(true); setAuthError(""); }}
                  style={{ flex: 1, padding: "8px", borderRadius: 6, border: "1px solid #374151", background: "#1f2937", color: "#e8e8e8", fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}
                >
                  Sign in
                </button>
                <button
                  onClick={() => { setAuthMode("signup"); setAuthOpen(true); setAuthError(""); }}
                  style={{ flex: 1, padding: "8px", borderRadius: 6, border: "none", background: "linear-gradient(135deg, #3BBFA3, #4A9EE0)", color: "#fff", fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}
                >
                  Sign up
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ── Map ──────────────────────────────────────────────────── */}
      <div id="voicemap-container" style={{ flex: 1, position: "relative" }} />

      {/* ── Alerts button ────────────────────────────────────────── */}
      <button
        onClick={() => { if (!user) { setAuthMode("login"); setAuthOpen(true); setAuthError(""); } else setAlertsOpen(true); }}
        style={{
          position: "absolute", top: 20, right: 20, zIndex: 1000,
          background: "#111827", border: "1px solid #374151", borderRadius: 8,
          color: "#e8e8e8", fontSize: 13, fontWeight: 600, padding: "10px 18px",
          cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
          boxShadow: "0 4px 16px rgba(0,0,0,0.5)", fontFamily: "'DM Sans', sans-serif",
          transition: "all 0.15s",
        }}
        onMouseEnter={e => e.currentTarget.style.borderColor = "#3BBFA3"}
        onMouseLeave={e => e.currentTarget.style.borderColor = "#374151"}
      >
        🔔 Alerts
      </button>

      {/* ── Auth modal ───────────────────────────────────────────── */}
      {authOpen && (
        <div style={{
          position: "absolute", inset: 0, background: "rgba(0,0,0,0.65)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 4000, padding: 24,
        }}>
          <div style={{
            width: "100%", maxWidth: 400,
            background: "#111827", borderRadius: 16, border: "1px solid #1f2937",
            padding: 28, boxShadow: "0 24px 64px rgba(0,0,0,0.9)",
            animation: "slideUp 0.25s ease",
          }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>
                  {authMode === "login" ? "Sign in to VoiceMap" : "Create an account"}
                </div>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 3 }}>
                  {authMode === "login" ? "Report issues and subscribe to alerts" : "Join your community on VoiceMap"}
                </div>
              </div>
              <button onClick={() => setAuthOpen(false)} style={{ background: "#1f2937", border: "none", borderRadius: 6, color: "#9ca3af", fontSize: 16, cursor: "pointer", padding: "4px 10px" }}>×</button>
            </div>

            {/* Fields */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input
                value={authForm.username}
                onChange={e => setAuthForm(f => ({ ...f, username: e.target.value }))}
                placeholder="Username"
                autoComplete="username"
                style={inputStyle}
              />
              <input
                value={authForm.password}
                onChange={e => setAuthForm(f => ({ ...f, password: e.target.value }))}
                placeholder="Password"
                type="password"
                autoComplete={authMode === "signup" ? "new-password" : "current-password"}
                style={inputStyle}
              />

              {/* Extra fields for signup only */}
              {authMode === "signup" && (
                <>
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
                    Provide at least one contact method for alerts:
                  </div>
                  <input
                    value={authForm.email}
                    onChange={e => setAuthForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="Email address (optional)"
                    type="email"
                    autoComplete="email"
                    style={inputStyle}
                  />
                  <input
                    value={authForm.phone}
                    onChange={e => setAuthForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="Phone number (optional)"
                    type="tel"
                    autoComplete="tel"
                    style={inputStyle}
                  />
                </>
              )}

              {/* Error */}
              {authError && (
                <div style={{ fontSize: 12, color: "#D45F5F", background: "#D45F5F11", border: "1px solid #D45F5F33", borderRadius: 6, padding: "8px 10px" }}>
                  {authError}
                </div>
              )}

              {/* Submit */}
              <button
                onClick={authMode === "login" ? handleLogin : handleSignup}
                disabled={authLoading}
                style={{
                  marginTop: 4, padding: "12px", borderRadius: 8, border: "none",
                  background: authLoading ? "#1f2937" : "linear-gradient(135deg, #3BBFA3, #4A9EE0)",
                  color: authLoading ? "#4b5563" : "#fff",
                  fontSize: 13, fontWeight: 600, cursor: authLoading ? "not-allowed" : "pointer",
                  fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s",
                }}
              >
                {authLoading ? "Please wait…" : authMode === "login" ? "Sign in →" : "Create account →"}
              </button>

              {/* Toggle mode */}
              <div style={{ textAlign: "center", fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                {authMode === "login" ? "Don't have an account? " : "Already have an account? "}
                <span
                  onClick={() => { setAuthMode(authMode === "login" ? "signup" : "login"); setAuthError(""); }}
                  style={{ color: "#3BBFA3", cursor: "pointer", fontWeight: 500 }}
                >
                  {authMode === "login" ? "Sign up" : "Sign in"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Alerts modal ─────────────────────────────────────────── */}
      {alertsOpen && (
        <div style={{
          position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 3000, padding: 24,
        }}>
          <div style={{
            width: "100%", maxWidth: 420,
            background: "#111827", borderRadius: 16, border: "1px solid #1f2937",
            padding: 28, boxShadow: "0 24px 64px rgba(0,0,0,0.8)",
            animation: "slideUp 0.25s ease",
          }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>🔔 Alert Preferences</div>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>Get notified about issues near you</div>
              </div>
              <button onClick={() => setAlertsOpen(false)} style={{ background: "#1f2937", border: "none", borderRadius: 6, color: "#9ca3af", fontSize: 16, cursor: "pointer", padding: "4px 10px" }}>×</button>
            </div>

            {/* Geolocation gate */}
            {geoError || !geoLocation ? (
              <div style={{ textAlign: "center", padding: "24px 0" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>📍</div>
                <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 16, lineHeight: 1.6 }}>
                  Please enable location permissions to use this feature.
                </div>
                <button
                  onClick={requestGeolocation}
                  style={{
                    padding: "10px 20px", borderRadius: 8, border: "1px solid #3BBFA3",
                    background: "#3BBFA322", color: "#3BBFA3", fontSize: 13,
                    fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  Enable Location Access
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                {/* Location confirmed */}
                <div style={{ fontSize: 11, color: "#3BBFA3", fontFamily: "'DM Mono', monospace", background: "#3BBFA311", borderRadius: 6, padding: "6px 10px" }}>
                  ✓ Location detected: {geoLocation.lat.toFixed(4)}, {geoLocation.lng.toFixed(4)}
                </div>

                {/* Enable toggle */}
                <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={alertPrefs.enabled}
                    onChange={e => setAlertPrefs(p => ({ ...p, enabled: e.target.checked }))}
                    style={{ width: 16, height: 16, accentColor: "#3BBFA3", cursor: "pointer" }}
                  />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>Enable alerts</div>
                    <div style={{ fontSize: 11, color: "#6b7280" }}>Receive notifications for new issues near you</div>
                  </div>
                </label>

                {/* Options — only shown when enabled */}
                {alertPrefs.enabled && (
                  <>
                    {/* Radius */}
                    <div>
                      <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                        Alert radius
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        {[0.25, 0.5, 1, 2, 5].map(r => (
                          <button
                            key={r}
                            onClick={() => setAlertPrefs(p => ({ ...p, radius: r }))}
                            style={{
                              flex: 1, padding: "8px 0", borderRadius: 6, fontSize: 11, fontWeight: 600,
                              border: `1px solid ${alertPrefs.radius === r ? "#3BBFA3" : "#374151"}`,
                              background: alertPrefs.radius === r ? "#3BBFA322" : "#1f2937",
                              color: alertPrefs.radius === r ? "#3BBFA3" : "#9ca3af",
                              cursor: "pointer", fontFamily: "'DM Mono', monospace",
                            }}
                          >
                            {r}mi
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Min severity */}
                    <div>
                      <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                        Minimum severity
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        {Object.entries(SEVERITIES).map(([k, v]) => {
                          const active = alertPrefs.minSeverity === k;
                          return (
                            <button
                              key={k}
                              onClick={() => setAlertPrefs(p => ({ ...p, minSeverity: k }))}
                              style={{
                                flex: 1, padding: "8px 0", borderRadius: 6, fontSize: 11, fontWeight: 600,
                                border: `1px solid ${active ? v.color : v.color + "44"}`,
                                background: active ? v.color + "33" : "#1f2937",
                                color: v.color,
                                cursor: "pointer", fontFamily: "'DM Mono', monospace",
                              }}
                            >
                              {v.label}
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 6 }}>
                        You'll receive alerts for <span style={{ color: SEVERITIES[alertPrefs.minSeverity]?.color }}>{SEVERITIES[alertPrefs.minSeverity]?.label}</span> severity and above within <strong style={{ color: "#e8e8e8" }}>{alertPrefs.radius} mile{alertPrefs.radius !== 1 ? "s" : ""}</strong> of your location.
                      </div>
                    </div>
                  </>
                )}

                {/* Save */}
                <button
                  onClick={() => setAlertsOpen(false)}
                  style={{
                    padding: "12px", borderRadius: 8, border: "none",
                    background: "linear-gradient(135deg, #3BBFA3, #4A9EE0)",
                    color: "#fff", fontSize: 13, fontWeight: 600,
                    cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  Save preferences
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {selected && !panelOpen && (
        <div style={{
          position: "absolute", bottom: 32, right: 32, width: 320,
          background: "#111827", border: "1px solid #1f2937", borderRadius: 12,
          padding: 20, zIndex: 1000, boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
          animation: "slideUp 0.2s ease"
        }}>
          <style>{`@keyframes slideUp { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }`}</style>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 20 }}>{cat?.icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{selected.title}</div>
                <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>{cat?.label}</div>
              </div>
            </div>
            <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", color: "#6b7280", fontSize: 18, cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
          </div>

          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", background: sev?.color + "22", color: sev?.color, borderRadius: 4, padding: "3px 8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>{selected.severity}</span>
            <span style={{ fontSize: 10, color: "#6b7280", padding: "3px 0" }}>{new Date(selected.created_at).toLocaleString()}</span>
          </div>

          {selected.impact_summary && (
            <p style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.6, margin: "0 0 12px", borderLeft: `2px solid ${cat?.color}50`, paddingLeft: 10 }}>
              {selected.impact_summary}
            </p>
          )}

          <div style={{ fontSize: 10, color: "#4b5563", fontFamily: "'DM Mono', monospace" }}>
            {selected.lat.toFixed(5)}, {selected.lng.toFixed(5)}
          </div>
        </div>
      )}

      {/* ── Submit panel ──────────────────────────────────────────── */}
      {panelOpen && (
        <div style={{
          position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)",
          display: "flex", alignItems: "flex-end", justifyContent: "center",
          zIndex: 2000, padding: 24
        }}>
          <div style={{
            width: "100%", maxWidth: 480,
            background: "#111827", borderRadius: 16, border: "1px solid #1f2937",
            padding: 24, boxShadow: "0 24px 64px rgba(0,0,0,0.8)",
            animation: "slideUp 0.25s ease"
          }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>Report an issue</div>
                {clickedLatLng && (
                  <div style={{ fontSize: 11, color: "#6b7280", fontFamily: "'DM Mono', monospace", marginTop: 2 }}>
                    {clickedLatLng.lat.toFixed(5)}, {clickedLatLng.lng.toFixed(5)}
                  </div>
                )}
              </div>
              <button onClick={() => setPanelOpen(false)} style={{ background: "#1f2937", border: "none", borderRadius: 6, color: "#9ca3af", fontSize: 16, cursor: "pointer", padding: "4px 10px" }}>×</button>
            </div>

            {/* Voice button */}
            <div style={{ marginBottom: 16 }}>
              <button
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
                onTouchStart={startRecording}
                onTouchEnd={stopRecording}
                style={{
                  width: "100%", padding: "14px", borderRadius: 10,
                  border: `2px solid ${recording ? "#3BBFA3" : "#374151"}`,
                  background: recording ? "#3BBFA322" : "#1f2937",
                  color: recording ? "#3BBFA3" : "#9ca3af",
                  fontSize: 13, fontWeight: 500, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                  transition: "all 0.15s", fontFamily: "'DM Sans', sans-serif"
                }}
              >
                <span style={{ fontSize: 18 }}>{recording ? "🔴" : "🎙️"}</span>
                {recording ? "Recording… release to stop" : "Hold to record voice report"}
              </button>

              {isProcessing && (
                <div style={{ textAlign: "center", fontSize: 11, color: "#6b7280", marginTop: 8 }}>Parsing with AI…</div>
              )}

              {transcript && !recording && (
                <div style={{ marginTop: 8, padding: "8px 12px", background: "#1f2937", borderRadius: 8, fontSize: 11, color: "#9ca3af", lineHeight: 1.5, fontStyle: "italic" }}>
                  "{transcript}"
                </div>
              )}
            </div>

            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{ flex: 1, height: 1, background: "#1f2937" }} />
              <span style={{ fontSize: 11, color: "#4b5563" }}>or type below</span>
              <div style={{ flex: 1, height: 1, background: "#1f2937" }} />
            </div>

            {/* Form fields */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Short description (e.g. 'Broken streetlight at Oak & 5th')"
                style={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8, color: "#e8e8e8", fontSize: 13, padding: "10px 12px", outline: "none", fontFamily: "'DM Sans', sans-serif" }}
              />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  style={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8, color: "#e8e8e8", fontSize: 12, padding: "10px 10px", outline: "none" }}
                >
                  {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                </select>

                <select
                  value={form.severity}
                  onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}
                  style={{ background: "#1f2937", border: `1px solid ${SEVERITIES[form.severity]?.color + "55" || "#374151"}`, borderRadius: 8, color: SEVERITIES[form.severity]?.color || "#e8e8e8", fontSize: 12, padding: "10px 10px", outline: "none" }}
                >
                  {Object.entries(SEVERITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>

              {/* Custom type — only shown when "Other" is selected */}
              {form.category === "other" && (
                <input
                  value={form.other_type}
                  onChange={e => setForm(f => ({ ...f, other_type: e.target.value }))}
                  placeholder="Describe the issue type (e.g. 'Broken bench', 'Missing sign')"
                  style={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8, color: "#e8e8e8", fontSize: 13, padding: "10px 12px", outline: "none", fontFamily: "'DM Sans', sans-serif" }}
                />
              )}

              <textarea
                value={form.impact_summary}
                onChange={e => setForm(f => ({ ...f, impact_summary: e.target.value }))}
                placeholder="Additional details or context (optional)"
                rows={2}
                style={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8, color: "#e8e8e8", fontSize: 12, padding: "10px 12px", outline: "none", resize: "vertical", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5 }}
              />

              {/* Emergency warning */}
              {form.severity === "emergency" && (
                <div style={{ background: "#D45F5F22", border: "1px solid #D45F5F55", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#D45F5F", display: "flex", gap: 8 }}>
                  <span>⚠️</span>
                  <span>If this is a life-threatening emergency, <strong>call 911 immediately</strong>. This app does not dispatch emergency services.</span>
                </div>
              )}

              <button
                onClick={submitReport}
                disabled={!form.title.trim()}
                style={{
                  padding: "12px", borderRadius: 8, border: "none",
                  background: form.title.trim() ? "linear-gradient(135deg, #3BBFA3, #4A9EE0)" : "#1f2937",
                  color: form.title.trim() ? "#fff" : "#4b5563",
                  fontSize: 13, fontWeight: 600, cursor: form.title.trim() ? "pointer" : "not-allowed",
                  fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s"
                }}
              >
                Pin to map →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}