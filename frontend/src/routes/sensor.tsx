import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  ReferenceLine, ReferenceArea, RadialBarChart, RadialBar, PolarAngleAxis, ComposedChart, Bar,
} from "recharts";
import {
  Activity, Droplet, FlaskConical, Sun, Sunrise, Thermometer, Waves, ArrowUp, ArrowDown, Minus,
  ShieldCheck, AlertTriangle, AlertOctagon, Bell, BellOff,
} from "lucide-react";
import { api, type SensorPoll, type SensorSample } from "@/lib/api";

export const Route = createFileRoute("/sensor")({
  head: () => ({ meta: [{ title: "Sensor Detail — Coralytics" }] }),
  component: SensorPage,
});

const POLL_MS = 5_000;
const HISTORY_CAP = 240;

const kToC = (k: number) => k - 273.15;

function fmt(n: number, d = 2, signed = false) {
  if (Number.isNaN(n)) return "—";
  const s = n.toFixed(d);
  return signed && n >= 0 ? `+${s}` : s;
}

type TileProps = {
  label: string;
  value: string;
  unit: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  series: number[];
  color: string;
  delta?: number;
  hint?: string;
  warn?: boolean;
};

function MetricTile({ label, value, unit, icon: Icon, series, color, delta, hint, warn }: TileProps) {
  const data = series.map((v) => ({ v }));
  const Arrow = delta == null || Math.abs(delta) < 1e-4 ? Minus : delta > 0 ? ArrowUp : ArrowDown;
  const trendCls =
    delta == null || Math.abs(delta) < 1e-4
      ? "text-[var(--color-text-muted)]"
      : delta > 0
      ? "text-[var(--color-warm)]"
      : "text-[var(--color-primary)]";
  return (
    <div
      className="reef-card p-5 flex flex-col"
      style={
        warn
          ? { boxShadow: "0 0 0 1px rgba(239,68,68,0.35), 0 0 24px rgba(239,68,68,0.18)" }
          : undefined
      }
    >
      <div className="flex items-center justify-between">
        <div className="label-eyebrow">{label}</div>
        <Icon size={14} strokeWidth={1.5} className="text-[var(--color-text-muted)]" />
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-mono-num text-[32px] leading-none text-[var(--color-text-primary)]">{value}</span>
        <span className="text-[var(--color-text-secondary)] text-[12px]">{unit}</span>
      </div>
      {delta != null && (
        <div className={`mt-2 flex items-center gap-1 text-[11px] font-mono-num ${trendCls}`}>
          <Arrow size={11} strokeWidth={1.6} />
          <span>{Math.abs(delta).toFixed(2)}</span>
          {hint && <span className="text-[var(--color-text-muted)] ml-1">· {hint}</span>}
        </div>
      )}
      <div className="mt-3 h-10 -mx-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function RiskGauge({ pct, level }: { pct: number; level: string }) {
  const fill = pct > 50 ? "#EF4444" : pct > 20 ? "#F2A65A" : "#4CAF84";
  const data = [{ name: "risk", value: Math.max(2, pct), fill }];
  return (
    <div className="relative w-full h-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart innerRadius="74%" outerRadius="100%" data={data} startAngle={210} endAngle={-30}>
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar background={{ fill: "var(--color-surface-raised)" }} dataKey="value" cornerRadius={20} angleAxisId={0} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="font-mono-num text-[44px] font-semibold text-[var(--color-text-primary)] leading-none">
          {pct.toFixed(1)}<span className="text-[18px] text-[var(--color-text-muted)]">%</span>
        </span>
        <span className="text-[var(--color-text-muted)] text-[11px] mt-2 uppercase tracking-wider">Bleaching probability</span>
        <span
          className="mt-2 inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wider uppercase"
          style={{ background: fill, color: "#fff" }}
        >
          {level} risk
        </span>
      </div>
    </div>
  );
}

function PHIndicator({ ph }: { ph: number }) {
  const min = 6.5, max = 9;
  const pos = Math.max(0, Math.min(100, ((ph - min) / (max - min)) * 100));
  const healthy = ph >= 8.1;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <div>
          <div className="label-eyebrow">pH</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono-num text-[32px] leading-none">{ph.toFixed(2)}</span>
            <span className="text-[12px] text-[var(--color-text-secondary)]">
              {healthy ? "Healthy" : "Below reef threshold (8.1)"}
            </span>
          </div>
        </div>
        <FlaskConical size={16} strokeWidth={1.5} className="text-[var(--color-text-muted)]" />
      </div>
      <div className="mt-5 relative h-2 rounded-full overflow-hidden"
        style={{ background: "linear-gradient(90deg, #EF4444 0%, #F2A65A 35%, #E8C547 50%, #4CAF84 70%, #22D3EE 100%)" }}>
        <div className="absolute top-1/2 -translate-y-1/2" style={{ left: `${pos}%` }}>
          <div className="w-3 h-3 rounded-full bg-white border-2 border-[var(--color-text-primary)] -translate-x-1/2" />
        </div>
        <div className="absolute top-0 bottom-0 w-px bg-[var(--color-text-primary)]/60"
          style={{ left: `${((8.1 - min) / (max - min)) * 100}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-[10px] font-mono-num text-[var(--color-text-muted)]">
        <span>6.5</span><span>7.5</span><span className="text-[var(--color-text-primary)]">8.1</span><span>9.0</span>
      </div>
    </div>
  );
}

function TurbidityIndicator({ ntu }: { ntu: number }) {
  const max = 25;
  const pos = Math.max(0, Math.min(100, (ntu / max) * 100));
  const tier = ntu < 5 ? "Clear" : ntu < 10 ? "Slightly turbid" : ntu < 20 ? "Turbid" : "Highly turbid";
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <div>
          <div className="label-eyebrow">Turbidity</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono-num text-[32px] leading-none">{ntu.toFixed(2)}</span>
            <span className="text-[12px] text-[var(--color-text-secondary)]">NTU · {tier}</span>
          </div>
        </div>
        <Droplet size={16} strokeWidth={1.5} className="text-[var(--color-text-muted)]" />
      </div>
      <div className="mt-5 relative h-2 rounded-full overflow-hidden bg-[var(--color-surface-raised)]">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${pos}%`, background: "linear-gradient(90deg, #22D3EE, #0B9B8A, #F2A65A, #EF4444)" }}
        />
      </div>
      <div className="mt-2 flex justify-between text-[10px] font-mono-num text-[var(--color-text-muted)]">
        <span>0</span><span>5</span><span>10</span><span>20</span><span>25+</span>
      </div>
    </div>
  );
}

function LightAttenuation({ surface, depth }: { surface: number; depth: number }) {
  const ratio = surface > 0 ? Math.max(0, Math.min(1, depth / surface)) : 0;
  const pct = ratio * 100;
  const tier = ratio > 0.6 ? "Excellent" : ratio > 0.4 ? "Good" : ratio > 0.2 ? "Reduced" : "Poor";
  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="label-eyebrow">Light Penetration</div>
        <Sun size={14} strokeWidth={1.5} className="text-[var(--color-text-muted)]" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-[12px]">
        <div>
          <div className="text-[var(--color-text-muted)]">Surface</div>
          <div className="font-mono-num text-[18px] mt-0.5">{surface.toFixed(0)} <span className="text-[11px] text-[var(--color-text-secondary)]">PAR</span></div>
        </div>
        <div>
          <div className="text-[var(--color-text-muted)]">At depth</div>
          <div className="font-mono-num text-[18px] mt-0.5">{depth.toFixed(0)} <span className="text-[11px] text-[var(--color-text-secondary)]">PAR</span></div>
        </div>
      </div>
      <div className="mt-4 relative h-2 rounded-full overflow-hidden bg-[var(--color-surface-raised)]">
        <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#E8C547] to-[#22D3EE]" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-[var(--color-text-muted)]">
        <span className="font-mono-num">{pct.toFixed(0)}% transmittance</span>
        <span>{tier}</span>
      </div>
    </div>
  );
}

function DhwBar({ dhw }: { dhw: number }) {
  const max = 12;
  const pct = Math.max(0, Math.min(100, (dhw / max) * 100));
  const tier =
    dhw < 1 ? { label: "No Stress", color: "#4CAF84" }
    : dhw < 4 ? { label: "Watch", color: "#E8C547" }
    : dhw < 8 ? { label: "Warning Lv 1", color: "#F2A65A" }
    : { label: "Alert Lv 2", color: "#EF4444" };
  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="label-eyebrow">Degree Heating Weeks</div>
        <Thermometer size={14} strokeWidth={1.5} className="text-[var(--color-text-muted)]" />
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-mono-num text-[32px] leading-none">{dhw.toFixed(2)}</span>
        <span className="text-[12px] text-[var(--color-text-secondary)]">°C-wk</span>
      </div>
      <div className="mt-4 relative h-3 rounded-full overflow-hidden bg-[var(--color-surface-raised)]">
        <div className="absolute inset-y-0 left-0" style={{ width: "8.33%", background: "rgba(76,175,132,0.35)" }} />
        <div className="absolute inset-y-0" style={{ left: "8.33%", width: "25%", background: "rgba(232,197,71,0.35)" }} />
        <div className="absolute inset-y-0" style={{ left: "33.33%", width: "33.33%", background: "rgba(242,166,90,0.4)" }} />
        <div className="absolute inset-y-0" style={{ left: "66.66%", right: 0, background: "rgba(239,68,68,0.45)" }} />
        <div className="absolute top-1/2 -translate-y-1/2" style={{ left: `calc(${pct}% - 6px)` }}>
          <div className="w-3 h-3 rounded-full bg-white border-2 border-[var(--color-text-primary)]" />
        </div>
      </div>
      <div className="mt-2 flex justify-between text-[10px] font-mono-num text-[var(--color-text-muted)]">
        <span>0</span><span>1</span><span>4</span><span>8</span><span>12+</span>
      </div>
      <div className="mt-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase"
        style={{ background: tier.color, color: dhw >= 4 ? "#fff" : "#1a1a1a" }}>
        {tier.label}
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="reef-card p-3 text-[12px] min-w-[160px]">
      <div className="font-mono-num text-[var(--color-text-muted)] mb-2">
        {new Date(label).toLocaleTimeString()}
      </div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ background: p.color || p.stroke || p.fill }} />
            <span className="text-[var(--color-text-secondary)]">{p.name}</span>
          </span>
          <span className="font-mono-num">{Number(p.value).toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

function SensorPage() {
  const [sensorId] = useState("1");
  const { data: poll, dataUpdatedAt } = useQuery<SensorPoll>({
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

  const chartData = useMemo(
    () =>
      samples.map((s) => ({
        ts: new Date(s.timestamp).getTime(),
        temperature_c: kToC(s.temperature_k),
        sst_c: kToC(s.sst_k),
        ssta: s.ssta,
        dhw: s.ssta_dhw,
        turbidity: s.turbidity,
        ph: s.ph,
        surface_light: s.surface_light,
        light_at_depth: s.light_at_depth,
      })),
    [samples],
  );

  if (!poll) {
    return <div className="text-[var(--color-text-muted)]">Connecting to sensor feed…</div>;
  }

  const latest = poll.latest;
  const prev = samples.length > 1 ? samples[samples.length - 2] : latest;
  const tempC = kToC(latest.temperature_k);
  const sstC = kToC(latest.sst_k);
  const dTempC = tempC - kToC(prev.temperature_k);
  const dSstC = sstC - kToC(prev.sst_k);
  const dSsta = latest.ssta - prev.ssta;
  const dDhw = latest.ssta_dhw - prev.ssta_dhw;

  const series = (pick: (s: SensorSample) => number) => samples.slice(-30).map(pick);
  const statusColor =
    poll.status === "online" ? "var(--color-success)"
    : poll.status === "degraded" ? "var(--color-warm)" : "var(--color-destructive)";
  const RiskIcon =
    poll.prediction.risk_level === "high" ? AlertOctagon
    : poll.prediction.risk_level === "medium" ? AlertTriangle : ShieldCheck;
  const updatedAgo = Math.max(0, Math.round((Date.now() - dataUpdatedAt) / 1000));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label-eyebrow flex items-center gap-2">
            <span className="w-2 h-2 rounded-full dot-pulse" style={{ background: statusColor }} />
            <span>Sensor {poll.sensor_id} · {poll.status}</span>
          </div>
          <h1 className="text-[28px] font-display mt-1">Sensor Telemetry</h1>
          <p className="text-[var(--color-text-muted)] mt-1 text-sm">
            Live polling every {POLL_MS / 1000}s · server {new Date(poll.server_time).toLocaleTimeString()} · updated {updatedAgo}s ago
          </p>
        </div>
        <div className="flex items-center gap-2 text-[12px] font-mono-num text-[var(--color-text-muted)]">
          <span className="px-2 py-1 rounded-full bg-[var(--color-surface-raised)]">{samples.length} samples</span>
          <span className="px-2 py-1 rounded-full bg-[var(--color-surface-raised)]">{latest.month}/{latest.year}</span>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="reef-card p-6 flex flex-col items-center">
          <RiskGauge pct={poll.prediction.bleaching_pct} level={poll.prediction.risk_level} />
        </div>
        <div className="reef-card p-6 lg:col-span-2 flex flex-col">
          <div className="flex items-start gap-3">
            <RiskIcon
              size={22}
              strokeWidth={1.5}
              className={
                poll.prediction.risk_level === "high" ? "text-[var(--color-destructive)]"
                : poll.prediction.risk_level === "medium" ? "text-[var(--color-warm)]"
                : "text-[var(--color-success)]"
              }
            />
            <div>
              <div className="label-eyebrow">Risk Assessment</div>
              <h2 className="font-display text-[20px] mt-1 capitalize">{poll.prediction.risk_level} risk · {poll.prediction.bleaching_level} bleaching</h2>
              <p className="text-[13px] text-[var(--color-text-secondary)] mt-2 leading-relaxed">{poll.prediction.risk_description}</p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3 text-[12px]">
            {poll.prediction.alert_sent ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--color-destructive)] text-white">
                <Bell size={12} /> Alert sent {poll.prediction.alert_type ? `· ${poll.prediction.alert_type}` : ""}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--color-surface-raised)] text-[var(--color-text-secondary)]">
                <BellOff size={12} /> No alert dispatched
              </span>
            )}
            {poll.prediction.bleaching_event && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--color-warm)] text-white">
                Bleaching event detected
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <MetricTile
          label="Temperature"
          value={fmt(tempC, 2)}
          unit="°C"
          icon={Thermometer}
          color="#0B9B8A"
          series={series((s) => kToC(s.temperature_k))}
          delta={dTempC}
          warn={tempC > sstC + 0.5}
        />
        <MetricTile
          label="Sea Surface Temp"
          value={fmt(sstC, 2)}
          unit="°C"
          icon={Waves}
          color="#22D3EE"
          series={series((s) => kToC(s.sst_k))}
          delta={dSstC}
        />
        <MetricTile
          label="SSTA"
          value={fmt(latest.ssta, 2, true)}
          unit="°C"
          icon={Activity}
          color="#A855F7"
          series={series((s) => s.ssta)}
          delta={dSsta}
          warn={latest.ssta > 1}
          hint="anomaly vs climatology"
        />
        <MetricTile
          label="DHW"
          value={fmt(latest.ssta_dhw, 2)}
          unit="°C-wk"
          icon={Sunrise}
          color="#F2A65A"
          series={series((s) => s.ssta_dhw)}
          delta={dDhw}
          warn={latest.ssta_dhw >= 4}
        />
        <MetricTile
          label="Turbidity"
          value={fmt(latest.turbidity, 2)}
          unit="NTU"
          icon={Droplet}
          color="#4A6B6B"
          series={series((s) => s.turbidity)}
          warn={latest.turbidity > 10}
        />
        <MetricTile
          label="pH"
          value={fmt(latest.ph, 2)}
          unit=""
          icon={FlaskConical}
          color="#E8C547"
          series={series((s) => s.ph)}
          warn={latest.ph < 8.1}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="reef-card p-6"><DhwBar dhw={latest.ssta_dhw} /></div>
        <div className="reef-card p-6"><PHIndicator ph={latest.ph} /></div>
        <div className="reef-card p-6"><TurbidityIndicator ntu={latest.turbidity} /></div>
      </div>

      <div className="reef-card p-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="label-eyebrow">Thermal Profile</div>
            <h2 className="font-display text-lg mt-1">In-situ temperature vs sea surface temperature</h2>
          </div>
          <div className="text-[11px] font-mono-num text-[var(--color-text-muted)]">
            {chartData.length} points
          </div>
        </div>
        <div className="mt-4 h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0B9B8A" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#0B9B8A" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="sstGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22D3EE" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#22D3EE" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--color-border)" vertical={false} strokeDasharray="3 4" />
              <XAxis
                dataKey="ts"
                tickFormatter={(v) => new Date(v).toLocaleTimeString().slice(0, 5)}
                stroke="var(--color-text-muted)" fontSize={11} tickLine={false} axisLine={false} minTickGap={32}
              />
              <YAxis stroke="var(--color-text-muted)" fontSize={11} tickLine={false} axisLine={false} domain={["auto", "auto"]} width={40} unit="°" />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="sst_c" name="SST" stroke="#22D3EE" strokeWidth={1.75} fill="url(#sstGrad)" isAnimationActive={false} />
              <Area type="monotone" dataKey="temperature_c" name="In-situ" stroke="#0B9B8A" strokeWidth={2} fill="url(#tempGrad)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="reef-card p-6">
          <div className="label-eyebrow">SSTA — Anomaly vs climatology</div>
          <div className="mt-4 h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="sstaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#A855F7" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#A855F7" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--color-border)" vertical={false} strokeDasharray="3 4" />
                <XAxis dataKey="ts" tickFormatter={(v) => new Date(v).toLocaleTimeString().slice(0, 5)} stroke="var(--color-text-muted)" fontSize={11} tickLine={false} axisLine={false} minTickGap={32} />
                <YAxis stroke="var(--color-text-muted)" fontSize={11} tickLine={false} axisLine={false} width={40} unit="°" />
                <ReferenceArea y1={1} y2={10} fill="#EF4444" fillOpacity={0.06} />
                <ReferenceLine y={0} stroke="var(--color-text-muted)" strokeDasharray="3 3" />
                <ReferenceLine y={1} stroke="#EF4444" strokeDasharray="2 4" label={{ value: "Stress threshold", fontSize: 10, fill: "#EF4444", position: "insideTopRight" }} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="ssta" name="SSTA" stroke="#A855F7" strokeWidth={1.75} fill="url(#sstaGrad)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="reef-card p-6">
          <div className="label-eyebrow">DHW — Heat stress accumulation</div>
          <div className="mt-4 h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-border)" vertical={false} strokeDasharray="3 4" />
                <XAxis dataKey="ts" tickFormatter={(v) => new Date(v).toLocaleTimeString().slice(0, 5)} stroke="var(--color-text-muted)" fontSize={11} tickLine={false} axisLine={false} minTickGap={32} />
                <YAxis stroke="var(--color-text-muted)" fontSize={11} tickLine={false} axisLine={false} width={36} domain={[0, (max: number) => Math.max(8, Math.ceil(max + 1))]} />
                <ReferenceLine y={4} stroke="#F2A65A" strokeDasharray="3 4" label={{ value: "Warning", fontSize: 10, fill: "#F2A65A", position: "insideTopRight" }} />
                <ReferenceLine y={8} stroke="#EF4444" strokeDasharray="3 4" label={{ value: "Alert", fontSize: 10, fill: "#EF4444", position: "insideTopRight" }} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="dhw" name="DHW" fill="#F2A65A" fillOpacity={0.85} radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="reef-card p-6">
        <div className="label-eyebrow">Water Quality</div>
        <div className="mt-4 h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--color-border)" vertical={false} strokeDasharray="3 4" />
              <XAxis dataKey="ts" tickFormatter={(v) => new Date(v).toLocaleTimeString().slice(0, 5)} stroke="var(--color-text-muted)" fontSize={11} tickLine={false} axisLine={false} minTickGap={32} />
              <YAxis yAxisId="left" stroke="#4A6B6B" fontSize={11} tickLine={false} axisLine={false} width={36} unit=" NTU" />
              <YAxis yAxisId="right" orientation="right" stroke="#E8C547" fontSize={11} tickLine={false} axisLine={false} width={36} domain={[6.5, 9]} />
              <ReferenceLine yAxisId="right" y={8.1} stroke="#E8C547" strokeDasharray="3 4" label={{ value: "Healthy pH", fontSize: 10, fill: "#E8C547", position: "insideTopRight" }} />
              <Tooltip content={<ChartTooltip />} />
              <Line yAxisId="left" type="monotone" dataKey="turbidity" name="Turbidity" stroke="#4A6B6B" strokeWidth={1.75} dot={false} isAnimationActive={false} />
              <Line yAxisId="right" type="monotone" dataKey="ph" name="pH" stroke="#E8C547" strokeWidth={1.75} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="reef-card p-6 lg:col-span-2">
          <div className="label-eyebrow">Light — Surface vs At Depth</div>
          <div className="mt-4 h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="surfGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#E8C547" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#E8C547" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="depGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22D3EE" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#22D3EE" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--color-border)" vertical={false} strokeDasharray="3 4" />
                <XAxis dataKey="ts" tickFormatter={(v) => new Date(v).toLocaleTimeString().slice(0, 5)} stroke="var(--color-text-muted)" fontSize={11} tickLine={false} axisLine={false} minTickGap={32} />
                <YAxis stroke="var(--color-text-muted)" fontSize={11} tickLine={false} axisLine={false} width={40} unit=" PAR" />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="surface_light" name="Surface" stroke="#E8C547" strokeWidth={1.75} fill="url(#surfGrad)" isAnimationActive={false} />
                <Area type="monotone" dataKey="light_at_depth" name="At depth" stroke="#22D3EE" strokeWidth={1.75} fill="url(#depGrad)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="reef-card p-6">
          <LightAttenuation surface={latest.surface_light} depth={latest.light_at_depth} />
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="reef-card p-6">
          <div className="label-eyebrow">Notices</div>
          <div className="mt-4 space-y-3">
            {poll.prediction.notices.length === 0 ? (
              <div className="text-[13px] text-[var(--color-text-muted)]">No notices.</div>
            ) : (
              poll.prediction.notices.map((n, i) => (
                <div key={i} className="flex items-start gap-3 py-2 border-b border-[var(--color-border)] last:border-0">
                  <span className="w-2 h-2 rounded-full mt-2 bg-[var(--color-warm)]" />
                  <span className="flex-1 text-[13px]">{n}</span>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="reef-card p-6">
          <div className="label-eyebrow">Next Steps</div>
          <ol className="mt-4 space-y-3">
            {poll.prediction.next_steps.map((s, i) => (
              <li key={i} className="flex gap-4">
                <span className="font-mono-num text-[var(--color-primary)] w-5 shrink-0">{i + 1}</span>
                <span className="text-[13px] text-[var(--color-text-primary)]">{s}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="reef-card p-6">
        <div className="label-eyebrow">Latest Reading</div>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-[12px]">
          {[
            ["Reading ID", latest._id],
            ["Sensor", latest.sensor_id],
            ["Timestamp", new Date(latest.timestamp).toLocaleString()],
            ["Temp (K)", latest.temperature_k.toFixed(2)],
            ["SST (K)", latest.sst_k.toFixed(2)],
            ["SSTA", latest.ssta.toFixed(2)],
            ["SSTA DHW", latest.ssta_dhw.toFixed(2)],
            ["Turbidity", `${latest.turbidity.toFixed(2)} NTU`],
            ["pH", latest.ph.toFixed(2)],
            ["Surface light", `${latest.surface_light.toFixed(0)} PAR`],
            ["Light @ depth", `${latest.light_at_depth.toFixed(0)} PAR`],
            ["Period", `${latest.month}/${latest.year}`],
          ].map(([k, v]) => (
            <div key={k as string}>
              <div className="text-[var(--color-text-muted)] uppercase tracking-wider text-[10px]">{k}</div>
              <div className="font-mono-num text-[var(--color-text-primary)] mt-1 break-all">{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
