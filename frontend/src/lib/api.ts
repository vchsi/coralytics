// Data adapter — single point to swap backend.
// Set VITE_API_BASE_URL and VITE_WS_URL to point at your FastAPI backend.
// While unset (or fetch fails), the adapter serves deterministic mock data
// so the UI is fully functional during development.

export type SensorReading = {
  ts: number; // epoch ms
  temperature_k: number;
  turbidity_ntu: number;
  pressure_atm: number;
  bleaching_pct: number;
  dhw_c_wk: number;
  ssta_c: number;
};

export type SensorMeta = {
  id: string;
  nickname: string;
  lat: number;
  lon: number;
  last_ping: number;
  status: "online" | "degraded" | "offline";
};

export type Prediction = {
  ts: number;
  risk_pct: number;
  trend: "up" | "down" | "flat";
  confidence: number; // 0..1
  anomaly_detected: boolean;
  anomaly_type?: string;
  severity?: "low" | "medium" | "high";
  notices: { ts: number; severity: "low" | "medium" | "high"; text: string }[];
  next_steps: string[];
  predicted_vs_actual: { metric: string; predicted: number; actual: number; unit: string }[];
};

export type AlertRow = {
  id: string;
  ts: number;
  sensor: string;
  metric: string;
  value: number;
  threshold: number;
  type: "SMS" | "CALL";
  status: "Sent" | "Failed";
  notice: string;
  risk_pct: number;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  ts: number;
  context?: { sensor: string; ts: number; values: Record<string, number> }[];
};

const BASE = (import.meta as any).env?.VITE_API_BASE_URL ?? "";
const WS = (import.meta as any).env?.VITE_WS_URL ?? "";

// ---------- Mock generators ----------
function seeded(n: number) {
  let x = Math.sin(n) * 10000;
  return x - Math.floor(x);
}
const SENSORS: SensorMeta[] = [
  { id: "REEF-01", nickname: "Coral Bay North", lat: -16.295, lon: 145.778, last_ping: Date.now(), status: "online" },
  { id: "REEF-02", nickname: "Lagoon East", lat: -16.31, lon: 145.81, last_ping: Date.now(), status: "online" },
  { id: "REEF-03", nickname: "Outer Shelf", lat: -16.35, lon: 145.89, last_ping: Date.now(), status: "degraded" },
];

function genReadings(count: number, stepMs: number): SensorReading[] {
  const now = Date.now();
  const out: SensorReading[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const ts = now - i * stepMs;
    const t = i / count;
    out.push({
      ts,
      temperature_k: 300.5 + Math.sin(t * 6) * 0.6 + seeded(i) * 0.3,
      turbidity_ntu: 2.4 + Math.sin(t * 3) * 0.8 + seeded(i + 7) * 0.4,
      pressure_atm: 1.02 + Math.sin(t * 2) * 0.01 + seeded(i + 3) * 0.005,
      bleaching_pct: 12 + Math.sin(t * 1.5) * 4 + seeded(i + 11) * 2,
      dhw_c_wk: Math.max(0, Math.min(16, 5 + Math.sin(t * 1.2) * 3 + seeded(i + 13) * 1.5)),
      ssta_c: 0.8 + Math.sin(t * 2.2) * 0.9 + seeded(i + 17) * 0.4,
    });
  }
  return out;
}

function genPrediction(): Prediction {
  const risk = 38 + Math.sin(Date.now() / 60000) * 14 + Math.random() * 6;
  return {
    ts: Date.now(),
    risk_pct: Math.max(0, Math.min(100, risk)),
    trend: risk > 50 ? "up" : risk < 30 ? "down" : "flat",
    confidence: 0.78 + Math.random() * 0.12,
    anomaly_detected: risk > 55,
    anomaly_type: risk > 55 ? "Thermal spike" : undefined,
    severity: risk > 70 ? "high" : risk > 55 ? "medium" : "low",
    notices: [
      { ts: Date.now() - 1000 * 60 * 4, severity: risk > 55 ? "medium" : "low", text: "Temperature drift exceeds 7-day baseline by 0.4 K." },
      { ts: Date.now() - 1000 * 60 * 22, severity: "low", text: "Turbidity normalized after morning swell." },
      { ts: Date.now() - 1000 * 60 * 90, severity: "low", text: "Diurnal cycle within expected envelope." },
    ],
    next_steps: [
      "Increase sampling cadence on REEF-01 to 30s for the next 2 hours.",
      "Cross-reference NOAA SST overlay for the current grid cell.",
      "Notify field team if risk_pct exceeds 65 for 15 consecutive minutes.",
    ],
    predicted_vs_actual: [
      { metric: "Temperature", predicted: 301.1, actual: 301.3, unit: "K" },
      { metric: "Turbidity", predicted: 2.6, actual: 2.4, unit: "NTU" },
      { metric: "Pressure", predicted: 1.02, actual: 1.02, unit: "atm" },
      { metric: "Bleaching", predicted: 13.2, actual: 14.0, unit: "%" },
    ],
  };
}

function genAlerts(count: number): AlertRow[] {
  const out: AlertRow[] = [];
  for (let i = 0; i < count; i++) {
    const ts = Date.now() - i * 1000 * 60 * Math.floor(8 + seeded(i) * 50);
    const isCall = seeded(i + 5) > 0.7;
    const failed = seeded(i + 2) > 0.9;
    out.push({
      id: `ALT-${1000 + i}`,
      ts,
      sensor: SENSORS[i % SENSORS.length].id,
      metric: ["Temperature", "Turbidity", "Bleaching", "Pressure"][i % 4],
      value: Number((300 + seeded(i) * 6).toFixed(2)),
      threshold: Number((300 + seeded(i + 1) * 5).toFixed(2)),
      type: isCall ? "CALL" : "SMS",
      status: failed ? "Failed" : "Sent",
      notice: "AI: anomaly probability above critical threshold for sustained window.",
      risk_pct: Math.round(50 + seeded(i + 3) * 40),
    });
  }
  return out;
}

// ---------- Sensor poll payload (matches backend contract) ----------
export type SensorSample = {
  _id: string;
  sensor_id: string;
  timestamp: string;
  temperature_k: number;
  sst_k: number;
  ssta: number;
  ssta_dhw: number;
  turbidity: number;
  ph: number;
  surface_light: number;
  light_at_depth: number;
  month: number;
  year: number;
};

export type SensorPrediction = {
  _id: string;
  sensor_id: string;
  sensor_reading_id: string;
  timestamp: string;
  bleaching_pct: number;
  bleaching_level: "low" | "medium" | "high" | string;
  bleaching_event: boolean;
  risk_level: "low" | "medium" | "high" | string;
  risk_description: string;
  notices: string[];
  next_steps: string[];
  alert_sent: boolean;
  alert_type: string | null;
};

export type SensorPoll = {
  sensor_id: string;
  status: "online" | "degraded" | "offline" | string;
  server_time: string;
  latest: SensorSample;
  prediction: SensorPrediction;
  history: SensorSample[];
};

function makeMockSample(sensorId: string, ts: number, i: number): SensorSample {
  const t = i / 30;
  const baseK = 296 + Math.sin(t * 1.4) * 1.4 + seeded(i + 91) * 0.6;
  const sstK = 298 + Math.sin(t * 1.1) * 0.9 + seeded(i + 13) * 0.4;
  const ssta = (baseK - 273.15) - (sstK - 273.15) + (seeded(i + 7) - 0.5) * 0.6;
  const dhw = Math.max(0, ssta * 1.8 + seeded(i + 41) * 0.5);
  const surface = 280 + Math.sin(t * 2) * 60 + seeded(i + 5) * 20;
  return {
    _id: `mock-${ts}-${i}`,
    sensor_id: sensorId,
    timestamp: new Date(ts).toISOString(),
    temperature_k: Number(baseK.toFixed(2)),
    sst_k: Number(sstK.toFixed(2)),
    ssta: Number(ssta.toFixed(2)),
    ssta_dhw: Number(dhw.toFixed(2)),
    turbidity: Number((4 + Math.sin(t * 3) * 3 + seeded(i + 17) * 1.5).toFixed(2)),
    ph: Number((7.6 + Math.sin(t * 0.8) * 0.4 + seeded(i + 23) * 0.2).toFixed(2)),
    surface_light: Number(surface.toFixed(2)),
    light_at_depth: Number((surface * (0.45 + seeded(i + 31) * 0.2)).toFixed(2)),
    month: new Date(ts).getUTCMonth() + 1,
    year: new Date(ts).getUTCFullYear(),
  };
}

function makeMockPoll(sensorId = "1"): SensorPoll {
  const now = Date.now();
  const history: SensorSample[] = [];
  for (let i = 60; i >= 0; i--) history.push(makeMockSample(sensorId, now - i * 60_000, i));
  const latest = history[history.length - 1];
  const tempC = latest.temperature_k - 273.15;
  const sstC = latest.sst_k - 273.15;
  const dhw = latest.ssta_dhw;
  const bleaching = Math.max(0, Math.min(100, dhw * 8 + (latest.ph < 8 ? (8 - latest.ph) * 12 : 0)));
  const level: "low" | "medium" | "high" = bleaching > 50 ? "high" : bleaching > 20 ? "medium" : "low";
  const notices: string[] = [];
  if (latest.ph < 8.1) notices.push(`pH at ${latest.ph.toFixed(2)} — below healthy reef threshold of 8.1`);
  if (dhw > 4) notices.push(`DHW ${dhw.toFixed(1)} °C-wk — significant heat stress accumulating`);
  if (tempC > sstC + 0.5) notices.push(`In-situ temperature ${tempC.toFixed(2)}°C exceeds SST baseline by ${(tempC - sstC).toFixed(2)}°C`);
  if (!notices.length) notices.push("All metrics within nominal envelope");
  return {
    sensor_id: sensorId,
    status: "online",
    server_time: new Date(now).toISOString(),
    latest,
    prediction: {
      _id: `mock-pred-${now}`,
      sensor_id: sensorId,
      sensor_reading_id: latest._id,
      timestamp: latest.timestamp,
      bleaching_pct: Number(bleaching.toFixed(1)),
      bleaching_level: level,
      bleaching_event: bleaching > 50,
      risk_level: level,
      risk_description:
        level === "high" ? "Severe thermal stress — bleaching event likely without intervention."
        : level === "medium" ? "Elevated stress signals — monitor closely."
        : "Reef conditions appear stable with no thermal stress detected.",
      notices,
      next_steps: [
        "Monitor pH trend over next 24 hours",
        "Cross-reference NOAA SST overlay for grid cell",
        dhw > 4 ? "Increase sampling cadence to 30s" : "Maintain standard 60s sampling",
      ],
      alert_sent: bleaching > 50,
      alert_type: bleaching > 50 ? "SMS" : null,
    },
    history,
  };
}

// ---------- Public API ----------
async function tryFetch<T>(path: string, fallback: () => T): Promise<T> {
  if (!BASE) return fallback();
  try {
    const r = await fetch(`${BASE}${path}`);
    if (!r.ok) throw new Error(String(r.status));
    return (await r.json()) as T;
  } catch {
    return fallback();
  }
}

export const api = {
  sensors: () => tryFetch<SensorMeta[]>("/sensors", () => SENSORS),
  readings: (window: "1h" | "6h" | "24h") => {
    const map = { "1h": [60, 60_000], "6h": [72, 5 * 60_000], "24h": [96, 15 * 60_000] } as const;
    const [count, step] = map[window];
    return tryFetch<SensorReading[]>(`/readings?window=${window}`, () => genReadings(count, step));
  },
  prediction: () => tryFetch<Prediction>("/prediction", genPrediction),
  poll: (sensorId = "1") => tryFetch<SensorPoll>(`/sensor/${sensorId}/poll`, () => makeMockPoll(sensorId)),
  predictionHistory: () =>
    tryFetch<{ ts: number; risk_pct: number; confidence: number; anomaly_detected: boolean; anomaly_type?: string }[]>(
      "/prediction/history",
      () => {
        const out = [];
        for (let i = 60; i >= 0; i--) {
          const ts = Date.now() - i * 60_000;
          const risk = 35 + Math.sin(i / 6) * 18 + seeded(i) * 8;
          const anomaly = risk > 55 && seeded(i + 3) > 0.6;
          out.push({
            ts,
            risk_pct: Math.max(0, Math.min(100, risk)),
            confidence: 0.7 + seeded(i) * 0.25,
            anomaly_detected: anomaly,
            anomaly_type: anomaly ? "Thermal spike" : undefined,
          });
        }
        return out;
      },
    ),
  alerts: () => tryFetch<AlertRow[]>("/alerts", () => genAlerts(60)),
  chat: async (history: ChatMessage[], userMessage: string): Promise<ChatMessage> => {
    if (BASE) {
      try {
        const r = await fetch(`${BASE}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ history, message: userMessage }),
        });
        if (r.ok) return await r.json();
      } catch {}
    }
    await new Promise((r) => setTimeout(r, 600));
    return {
      id: crypto.randomUUID(),
      role: "assistant",
      ts: Date.now(),
      content: `Based on the most recent readings from REEF-01 (temp **301.3 K**, turbidity **2.4 NTU**, bleaching **14%**), conditions are **stable** with a low-grade thermal drift over the last 6 hours. Risk score is currently **${Math.round(35 + Math.random() * 20)}%**.\n\nRecommendation: monitor REEF-03 — it shows elevated turbidity correlated with the morning tide cycle.`,
      context: [
        { sensor: "REEF-01", ts: Date.now() - 60_000, values: { temp_k: 301.3, turbidity_ntu: 2.4 } },
        { sensor: "REEF-03", ts: Date.now() - 180_000, values: { temp_k: 302.1, turbidity_ntu: 4.8 } },
      ],
    };
  },
};

// ---------- WebSocket abstraction ----------
export type WSStatus = "connecting" | "live" | "reconnecting" | "offline";

export function subscribeLive(
  onReading: (r: SensorReading) => void,
  onStatus: (s: WSStatus) => void,
): () => void {
  let cancelled = false;
  let ws: WebSocket | null = null;
  let mockTimer: number | null = null;

  const startMock = () => {
    onStatus("live");
    mockTimer = window.setInterval(() => {
      if (cancelled) return;
      const last = genReadings(1, 1000)[0];
      onReading(last);
    }, 3000);
  };

  if (!WS) {
    startMock();
  } else {
    onStatus("connecting");
    try {
      ws = new WebSocket(WS);
      ws.onopen = () => onStatus("live");
      ws.onmessage = (e) => {
        try { onReading(JSON.parse(e.data)); } catch {}
      };
      ws.onclose = () => { onStatus("reconnecting"); startMock(); };
      ws.onerror = () => { onStatus("reconnecting"); startMock(); };
    } catch {
      startMock();
    }
  }

  return () => {
    cancelled = true;
    if (mockTimer) window.clearInterval(mockTimer);
    if (ws) ws.close();
  };
}
