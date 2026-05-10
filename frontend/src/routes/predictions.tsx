import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  RadialBar, RadialBarChart, ResponsiveContainer, PolarAngleAxis,
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Area, ComposedChart, ReferenceDot,
} from "recharts";
import { ArrowDown, ArrowRight, ArrowUp, ShieldCheck, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";

export const Route = createFileRoute("/predictions")({
  head: () => ({ meta: [{ title: "Predictions — Coralytics" }] }),
  component: Predictions,
});

function Gauge({ value }: { value: number }) {
  const fill = value > 70 ? "#E05C5C" : value > 40 ? "#F2A65A" : "#0B9B8A";
  const data = [{ name: "risk", value, fill }];
  return (
    <div className="relative w-full h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          innerRadius="78%"
          outerRadius="100%"
          data={data}
          startAngle={200}
          endAngle={-20}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar background={{ fill: "#E2EEEE" }} dataKey="value" cornerRadius={20} angleAxisId={0} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="font-mono-num text-[48px] font-semibold text-[var(--color-text-primary)] leading-none">
          {Math.round(value)}
        </span>
        <span className="text-[var(--color-text-muted)] text-[12px] mt-2 uppercase tracking-wider">Risk Score</span>
      </div>
    </div>
  );
}

function Predictions() {
  const { data: pred } = useQuery({ queryKey: ["prediction"], queryFn: api.prediction, refetchInterval: 10000 });
  const { data: history = [] } = useQuery({ queryKey: ["pred-history"], queryFn: api.predictionHistory, refetchInterval: 30000 });

  if (!pred) return <div className="text-[var(--color-text-muted)]">Loading prediction…</div>;

  const TrendIcon = pred.trend === "up" ? ArrowUp : pred.trend === "down" ? ArrowDown : ArrowRight;
  const trendColor = pred.trend === "up" ? "text-[var(--color-warm)]" : pred.trend === "down" ? "text-[var(--color-primary)]" : "text-[var(--color-text-secondary)]";

  const histWithBand = history.map((h) => {
    const span = (1 - h.confidence) * 10;
    return { ...h, low: Math.max(0, h.risk_pct - span), high: Math.min(100, h.risk_pct + span), band: [Math.max(0, h.risk_pct - span), Math.min(100, h.risk_pct + span)] };
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[28px] font-display">Predictions & Risk Metrics</h1>
        <p className="text-[var(--color-text-muted)] mt-1 text-sm">AI-driven risk modelling over recent sensor history.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="reef-card p-6">
          <div className="label-eyebrow">Current Risk</div>
          <Gauge value={pred.risk_pct} />
        </div>

        <div className="space-y-4">
          <div className="reef-card p-6">
            <div className="label-eyebrow">Trend</div>
            <div className={`mt-3 flex items-center gap-3 ${trendColor}`}>
              <TrendIcon size={28} strokeWidth={1.5} />
              <span className="font-display text-xl capitalize">{pred.trend === "flat" ? "Stable" : pred.trend === "up" ? "Worsening" : "Improving"}</span>
            </div>
          </div>
          <div className="reef-card p-6">
            <div className="label-eyebrow">Model Confidence</div>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex-1 h-1.5 rounded-full bg-[var(--color-surface-raised)] overflow-hidden">
                <div className="h-full bg-[var(--color-primary)] rounded-full transition-all duration-500" style={{ width: `${Math.round(pred.confidence * 100)}%` }} />
              </div>
              <span className="font-mono-num text-sm text-[var(--color-text-secondary)]">{Math.round(pred.confidence * 100)}%</span>
            </div>
          </div>
          <div className="reef-card p-6">
            <div className="label-eyebrow">Anomaly Status</div>
            <div className="mt-3 flex items-center gap-3">
              {pred.anomaly_detected ? (
                <>
                  <AlertTriangle className="text-[var(--color-warm)]" size={20} strokeWidth={1.5} />
                  <div>
                    <div className="text-[var(--color-text-primary)]">{pred.anomaly_type}</div>
                    <div className="text-[12px] text-[var(--color-text-muted)] capitalize">{pred.severity} severity</div>
                  </div>
                </>
              ) : (
                <>
                  <ShieldCheck className="text-[var(--color-success)]" size={20} strokeWidth={1.5} />
                  <span className="text-[var(--color-text-primary)]">No anomaly detected</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="reef-card p-6">
          <div className="label-eyebrow">Notices</div>
          <div className="mt-4 space-y-3">
            {pred.notices.map((n, i) => {
              const c = n.severity === "high" ? "bg-[var(--color-destructive)]" : n.severity === "medium" ? "bg-[var(--color-warm)]" : "bg-[var(--color-success)]";
              return (
                <div key={i} className="flex items-start gap-3 py-2 border-b border-[var(--color-border)] last:border-0">
                  <span className={`w-2 h-2 rounded-full mt-2 ${c}`} />
                  <span className="flex-1 text-[13px]">{n.text}</span>
                  <span className="text-[11px] font-mono-num text-[var(--color-text-muted)]">
                    {new Date(n.ts).toLocaleTimeString().slice(0, 5)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="reef-card p-6">
          <div className="label-eyebrow">Next Steps</div>
          <ol className="mt-4 space-y-3">
            {pred.next_steps.map((s, i) => (
              <li key={i} className="flex gap-4">
                <span className="font-mono-num text-[var(--color-primary)] w-5 shrink-0">{i + 1}</span>
                <span className="text-[13px] text-[var(--color-text-primary)]">{s}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="reef-card p-6">
        <div className="label-eyebrow">Risk History</div>
        <div className="mt-4 h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={histWithBand} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="riskBand" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0B9B8A" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#0B9B8A" stopOpacity={0.04} />
                </linearGradient>
                <linearGradient id="riskLine" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#0B9B8A" />
                  <stop offset="100%" stopColor="#3FC3B2" />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#E2EEEE" vertical={false} strokeDasharray="3 4" />
              <XAxis dataKey="ts" tickFormatter={(v) => new Date(v).toLocaleTimeString().slice(0, 5)} stroke="#8AABAB" fontSize={11} tickLine={false} axisLine={false} minTickGap={32} />
              <YAxis stroke="#8AABAB" fontSize={11} tickLine={false} axisLine={false} domain={[0, 100]} width={32} />
              <Tooltip
                contentStyle={{ background: "rgba(255,255,255,0.96)", backdropFilter: "blur(8px)", border: "1px solid #E2EEEE", borderRadius: 10, fontSize: 12, boxShadow: "0 8px 24px -12px rgba(11,155,138,0.25)" }}
                cursor={{ stroke: "#0B9B8A", strokeWidth: 1, strokeDasharray: "3 3", strokeOpacity: 0.5 }}
                labelFormatter={(v) => new Date(v as number).toLocaleTimeString()}
                animationDuration={200}
                animationEasing="ease-out"
              />
              <Area dataKey="band" stroke="none" fill="url(#riskBand)" isAnimationActive type="monotone" animationDuration={600} animationEasing="ease-in-out" />
              <Line type="monotone" dataKey="risk_pct" stroke="url(#riskLine)" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" dot={false} activeDot={{ r: 5, fill: "#0B9B8A", stroke: "#fff", strokeWidth: 2 }} isAnimationActive animationDuration={700} animationEasing="ease-in-out" />
              {histWithBand.filter((h) => h.anomaly_detected).map((h, i) => (
                <ReferenceDot key={i} x={h.ts} y={h.risk_pct} r={4} fill="#E05C5C" stroke="white" />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="reef-card p-6">
        <div className="label-eyebrow">Predicted vs Actual</div>
        <table className="w-full mt-4 text-[13px]">
          <thead>
            <tr className="text-left text-[var(--color-text-muted)] text-[11px] uppercase tracking-wider">
              <th className="font-medium pb-3">Metric</th>
              <th className="font-medium pb-3 text-right">Predicted</th>
              <th className="font-medium pb-3 text-right">Actual</th>
              <th className="font-medium pb-3 text-right">Δ</th>
            </tr>
          </thead>
          <tbody>
            {pred.predicted_vs_actual.map((r) => {
              const delta = r.actual - r.predicted;
              const c = Math.abs(delta) < 0.001 ? "text-[var(--color-text-muted)]" : delta > 0 ? "text-[var(--color-warm)]" : "text-[var(--color-primary)]";
              return (
                <tr key={r.metric} className="border-t border-[var(--color-border)]">
                  <td className="py-3">{r.metric}</td>
                  <td className="py-3 text-right font-mono-num">{r.predicted.toFixed(2)} {r.unit}</td>
                  <td className="py-3 text-right font-mono-num">{r.actual.toFixed(2)} {r.unit}</td>
                  <td className={`py-3 text-right font-mono-num ${c}`}>{delta >= 0 ? "+" : ""}{delta.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
