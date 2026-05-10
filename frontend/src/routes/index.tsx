import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Line, LineChart, ResponsiveContainer, ComposedChart, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from "recharts";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { api, type SensorPoll, type SensorSample } from "@/lib/api";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Live Dashboard — Coralytics" }] }),
  component: Dashboard,
});

const POLL_MS = 5_000;
const HISTORY_CAP = 240;
const kToC = (k: number) => k - 273.15;

type Row = {
  ts: number;
  temperature_c: number;
  sst_c: number;
  ssta: number;
  dhw: number;
  turbidity: number;
  ph: number;
  surface_light: number;
  light_at_depth: number;
};

type MetricKey = "temperature_c" | "sst_c" | "ssta" | "dhw" | "turbidity" | "ph" | "surface_light" | "light_at_depth";

const METRICS: {
  key: MetricKey;
  label: string;
  unit: string;
  color: string;
  fmt: (n: number) => string;
  axis: "left" | "right";
}[] = [
  { key: "temperature_c",   label: "Temperature",        unit: "°C",   color: "#0B9B8A", fmt: (n) => n.toFixed(2), axis: "left"  },
  { key: "sst_c",           label: "Sea Surface Temp",   unit: "°C",   color: "#22D3EE", fmt: (n) => n.toFixed(2), axis: "left"  },
  { key: "ssta",            label: "SSTA",               unit: "°C",   color: "#A855F7", fmt: (n) => (n >= 0 ? `+${n.toFixed(2)}` : n.toFixed(2)), axis: "right" },
  { key: "dhw",             label: "DHW",                unit: "°C-wk", color: "#F2A65A", fmt: (n) => n.toFixed(2), axis: "right" },
  { key: "turbidity",       label: "Turbidity",          unit: "NTU",  color: "#4A6B6B", fmt: (n) => n.toFixed(2), axis: "right" },
  { key: "ph",              label: "pH",                 unit: "",     color: "#E8C547", fmt: (n) => n.toFixed(2), axis: "right" },
  { key: "surface_light",   label: "Surface Light",      unit: "PAR",  color: "#FBBF24", fmt: (n) => n.toFixed(0), axis: "left"  },
  { key: "light_at_depth",  label: "Light at Depth",     unit: "PAR",  color: "#0EA5E9", fmt: (n) => n.toFixed(0), axis: "left"  },
];

function sampleToRow(s: SensorSample): Row {
  return {
    ts: new Date(s.timestamp).getTime(),
    temperature_c: kToC(s.temperature_k),
    sst_c: kToC(s.sst_k),
    ssta: s.ssta,
    dhw: s.ssta_dhw,
    turbidity: s.turbidity,
    ph: s.ph,
    surface_light: s.surface_light,
    light_at_depth: s.light_at_depth,
  };
}

function StatCard({
  m,
  rows,
  glow,
}: {
  m: typeof METRICS[number];
  rows: Row[];
  glow?: boolean;
}) {
  const last = rows.length ? (rows[rows.length - 1][m.key] as number) : 0;
  const prev = rows.length > 1 ? (rows[rows.length - 2][m.key] as number) : last;
  const delta = last - prev;
  const trendUp = Math.abs(delta) < 0.001 ? "flat" : delta > 0 ? "up" : "down";
  const trendColor =
    trendUp === "flat" ? "text-[var(--color-text-muted)]"
    : trendUp === "up" ? "text-[var(--color-warm)]"
    : "text-[var(--color-primary)]";
  const Arrow = trendUp === "up" ? ArrowUp : trendUp === "down" ? ArrowDown : Minus;
  const sparkData = rows.slice(-30).map((r) => ({ v: r[m.key] as number }));
  const valueColor =
    (m.key === "ssta" && last > 1) || (m.key === "ph" && last < 8.1)
      ? "text-[var(--color-warm)]"
      : "text-[var(--color-text-primary)]";
  return (
    <div
      className="reef-card p-6"
      style={
        glow
          ? { boxShadow: "0 0 0 1px rgba(224,92,92,0.35), 0 0 24px rgba(224,92,92,0.18)" }
          : undefined
      }
    >
      <div className="label-eyebrow">{m.label}</div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className={`font-mono-num text-[36px] leading-none ${valueColor}`}>
          {m.fmt(last)}
        </span>
        <span className="text-[var(--color-text-secondary)] text-[13px]">{m.unit}</span>
      </div>
      <div className={`mt-2 flex items-center gap-1 text-[12px] font-mono-num ${trendColor}`}>
        <Arrow size={12} strokeWidth={1.5} />
        <span>{Math.abs(delta).toFixed(3)}</span>
      </div>
      <div className="mt-4 h-12 -mx-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={sparkData}>
            <Line type="monotone" dataKey="v" stroke={m.color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function RiskCard({ pct, level, description }: { pct: number; level: string; description: string }) {
  const tier =
    level === "high" ? { bg: "#E05C5C", fg: "#ffffff", label: "ALERT" }
    : level === "medium" ? { bg: "#F2A65A", fg: "#1a1a1a", label: "WARNING" }
    : { bg: "#0B9B8A", fg: "#ffffff", label: "STABLE" };
  return (
    <div className="reef-card p-6 flex flex-col">
      <div className="label-eyebrow">Risk Level</div>
      <div className="mt-3">
        <span
          className="inline-flex items-center px-3 py-1.5 rounded-full text-[12px] font-semibold tracking-wider"
          style={{ background: tier.bg, color: tier.fg }}
        >
          {tier.label}
        </span>
      </div>
      <div className="mt-3 text-[13px] text-[var(--color-text-secondary)] leading-snug">
        {description}
      </div>
      <div className="mt-auto pt-4 text-[12px] font-mono-num text-[var(--color-text-muted)]">
        Bleaching probability: {(pct / 100).toFixed(2)}
      </div>
    </div>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="reef-card p-3 text-[12px]">
      <div className="font-mono-num text-[var(--color-text-muted)] mb-2">
        {new Date(label).toLocaleTimeString()}
      </div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-3 justify-between">
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ background: p.stroke || p.fill }} />
            <span className="text-[var(--color-text-secondary)]">{p.name}</span>
          </span>
          <span className="font-mono-num">{Number(p.value).toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

function Dashboard() {
  const [sensorId] = useState("1");
  const [active, setActive] = useState<Record<MetricKey, boolean>>({
    temperature_c: true, sst_c: true, ssta: false, dhw: true,
    turbidity: true, ph: true, surface_light: false, light_at_depth: false,
  });

  const { data: poll } = useQuery<SensorPoll>({
    queryKey: ["sensor-poll", sensorId],
    queryFn: () => api.poll(sensorId),
    refetchInterval: POLL_MS,
  });

  const [samples, setSamples] = useState<SensorSample[]>([]);
  const lastIdRef = useRef<string>("");
  useEffect(() => {
    if (!poll) return;
    setSamples((prev) => {
      let base = prev.length === 0 && poll.history?.length ? [...poll.history] : prev;
      if (poll.latest && poll.latest._id !== lastIdRef.current) {
        lastIdRef.current = poll.latest._id;
        if (!base.some((s) => s._id === poll.latest._id)) base = [...base, poll.latest];
      }
      return base.slice(-HISTORY_CAP);
    });
  }, [poll]);

  const rows = useMemo(() => samples.map(sampleToRow), [samples]);
  const last = rows[rows.length - 1];
  const tempWarmer = last && last.temperature_c > last.sst_c + 0.3;

  return (
    <div className="space-y-8 flex flex-col min-h-full">
      <div>
        <h1 className="text-[28px] font-display">Live Sensor Dashboard</h1>
        <p className="text-[var(--color-text-muted)] mt-1 text-sm">
          Polling sensor {sensorId} every {POLL_MS / 1000}s · {samples.length} samples buffered
          {poll ? ` · ${poll.status}` : " · connecting…"}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {METRICS.slice(0, 6).map((m) => (
          <StatCard
            key={m.key}
            m={m}
            rows={rows}
            glow={m.key === "temperature_c" && !!tempWarmer}
          />
        ))}
        {poll && (
          <RiskCard
            pct={poll.prediction.bleaching_pct}
            level={poll.prediction.risk_level}
            description={poll.prediction.risk_description}
          />
        )}
      </div>

      <div className="reef-card p-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="label-eyebrow">Time Series</div>
            <h2 className="font-display text-lg mt-1">Multi-metric history</h2>
          </div>
          <div className="text-[11px] font-mono-num text-[var(--color-text-muted)]">
            {rows.length} points
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-4">
          {METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => setActive((a) => ({ ...a, [m.key]: !a[m.key] }))}
              className="flex items-center gap-2 text-[12px] text-[var(--color-text-secondary)]"
            >
              <span
                className="w-2.5 h-2.5 rounded-full border"
                style={{ background: active[m.key] ? m.color : "transparent", borderColor: m.color }}
              />
              <span className={active[m.key] ? "text-[var(--color-text-primary)]" : ""}>
                {m.label}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-6 h-[340px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows}>
              <CartesianGrid stroke="var(--color-border)" vertical={false} strokeDasharray="3 4" />
              <XAxis
                dataKey="ts"
                tickFormatter={(v) => new Date(v).toLocaleTimeString().slice(0, 5)}
                stroke="var(--color-text-muted)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                minTickGap={32}
              />
              <YAxis yAxisId="left" stroke="var(--color-text-muted)" fontSize={11} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
              <YAxis yAxisId="right" orientation="right" stroke="var(--color-text-muted)" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              {METRICS.map(
                (m) =>
                  active[m.key] && (
                    <Line
                      key={m.key}
                      type="monotone"
                      dataKey={m.key}
                      name={m.label}
                      yAxisId={m.axis}
                      stroke={m.color}
                      strokeWidth={1.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                  ),
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {poll && last && (
        <div className="text-[12px] font-mono-num text-[var(--color-text-muted)] flex flex-wrap gap-x-3 gap-y-1">
          <span>Sensor {poll.sensor_id}</span><span>·</span>
          <span>last reading {new Date(last.ts).toLocaleTimeString()}</span><span>·</span>
          <span className="px-2 py-0.5 rounded-full bg-[var(--color-accent-soft)] text-[var(--color-primary)] uppercase tracking-wider">{poll.status}</span>
        </div>
      )}

    </div>
  );
}
