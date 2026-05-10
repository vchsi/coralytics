import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Pencil, Check, Sun, Moon } from "lucide-react";
import { api, type SensorMeta } from "@/lib/api";
import { toast } from "sonner";
import { useTheme } from "@/lib/theme";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — Coralytics" }] }),
  component: Settings,
});

function Settings() {
  const { data: sensors = [] } = useQuery({ queryKey: ["sensors"], queryFn: api.sensors });
  const [section, setSection] = useState<"alerts" | "contact" | "appearance">("alerts");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[28px] font-display">Settings</h1>
        <p className="text-[var(--color-text-muted)] mt-1 text-sm">Thresholds, alert routing, and contact preferences.</p>
      </div>

      <div className="grid md:grid-cols-[180px_1fr] gap-8">
        <nav className="md:sticky md:top-6 self-start space-y-1 text-[13px]">
          {[
            { k: "alerts", l: "Alert Configuration" },
            { k: "contact", l: "Contact & Phone" },
            { k: "appearance", l: "Appearance" },
          ].map((s) => (
            <button
              key={s.k}
              onClick={() => setSection(s.k as any)}
              className={`block w-full text-left px-3 py-2 rounded-md transition-colors ${
                section === s.k
                  ? "bg-[var(--color-accent-soft)] text-[var(--color-primary)]"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)]"
              }`}
            >
              {s.l}
            </button>
          ))}
        </nav>

        <div className="space-y-6">
          {section === "alerts" && sensors.map((s) => <SensorCard key={s.id} sensor={s} />)}
          {section === "contact" && <ContactCard />}
          {section === "appearance" && <AppearanceCard />}
        </div>
      </div>
    </div>
  );
}

function SensorCard({ sensor }: { sensor: SensorMeta }) {
  const [name, setName] = useState(sensor.nickname);
  const [editing, setEditing] = useState(false);
  const [warn, setWarn] = useState(55);
  const [crit, setCrit] = useState(75);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 600));
    setSaving(false);
    toast.success("Thresholds saved");
  };

  return (
    <div className="reef-card p-6">
      <div className="flex items-center gap-3">
        {editing ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setEditing(false)}
            autoFocus
            className="font-display text-lg bg-transparent border-b border-[var(--color-primary)] focus:outline-none"
          />
        ) : (
          <h3 className="font-display text-lg">{name}</h3>
        )}
        <button onClick={() => setEditing((e) => !e)} className="text-[var(--color-text-muted)] hover:text-[var(--color-primary)]">
          {editing ? <Check size={14} strokeWidth={1.5} /> : <Pencil size={14} strokeWidth={1.5} />}
        </button>
        <span className="ml-auto font-mono-num text-[12px] text-[var(--color-text-muted)]">{sensor.id}</span>
      </div>

      <div className="mt-6 space-y-5">
        <ThresholdRow
          color="bg-[var(--color-warm)]"
          label="SMS alert at"
          value={warn}
          onChange={setWarn}
        />
        <ThresholdRow
          color="bg-[var(--color-destructive)]"
          label="Voice call at"
          value={crit}
          onChange={setCrit}
        />
      </div>

      <button
        onClick={() => setExpanded((x) => !x)}
        className="mt-6 flex items-center gap-2 text-[12px] text-[var(--color-text-secondary)]"
      >
        {expanded ? <ChevronDown size={14} strokeWidth={1.5} /> : <ChevronRight size={14} strokeWidth={1.5} />}
        Raw metric thresholds
      </button>
      {expanded && (
        <div className="mt-4 grid grid-cols-[1fr_100px_100px] gap-3 items-center text-[13px]">
          <div className="label-eyebrow col-span-1" />
          <div className="label-eyebrow text-right">Warn</div>
          <div className="label-eyebrow text-right">Critical</div>
          {[
            { l: "Temperature (K)", w: 301.5, c: 302.5 },
            { l: "Turbidity (NTU)", w: 4, c: 7 },
            { l: "Pressure (atm)", w: 1.05, c: 1.1 },
            { l: "Bleaching (%)", w: 20, c: 35 },
          ].map((m) => (
            <>
              <span className="text-[var(--color-text-secondary)]">{m.l}</span>
              <input defaultValue={m.w} className="h-9 px-2 text-right font-mono-num text-[13px] border border-[var(--color-border)] rounded-md" />
              <input defaultValue={m.c} className="h-9 px-2 text-right font-mono-num text-[13px] border border-[var(--color-border)] rounded-md" />
            </>
          ))}
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="px-5 h-10 rounded-md bg-[var(--color-primary)] text-white text-[13px] disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

function ThresholdRow({ color, label, value, onChange }: { color: string; label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-2 h-2 rounded-full ${color}`} />
        <span className="text-[13px] text-[var(--color-text-secondary)]">{label}</span>
      </div>
      <div className="flex items-center gap-4">
        <input
          type="range"
          min={0}
          max={100}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 accent-[var(--color-primary)]"
        />
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-20 h-9 px-2 text-right font-mono-num text-[13px] border border-[var(--color-border)] rounded-md"
        />
        <span className="text-[12px] text-[var(--color-text-muted)] w-6">%</span>
      </div>
    </div>
  );
}

function ContactCard() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const valid = /^\+\d{8,15}$/.test(phone.replace(/\s/g, ""));
  const [test, setTest] = useState<{ sms?: "loading" | "ok"; call?: "loading" | "ok" }>({});

  const runTest = async (k: "sms" | "call") => {
    setTest((s) => ({ ...s, [k]: "loading" }));
    await new Promise((r) => setTimeout(r, 900));
    setTest((s) => ({ ...s, [k]: "ok" }));
    toast.success(k === "sms" ? "Test SMS sent" : "Test call placed");
    setTimeout(() => setTest((s) => ({ ...s, [k]: undefined })), 3000);
  };

  return (
    <div className="reef-card p-6">
      <h3 className="font-display text-lg">Contact details</h3>
      <div className="mt-6 space-y-4">
        <div>
          <label className="label-eyebrow">Full name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-2 w-full h-10 px-3 border border-[var(--color-border)] rounded-md text-[14px] focus:outline-none focus:border-[var(--color-primary)]"
          />
        </div>
        <div>
          <label className="label-eyebrow">Phone number</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+15551234567"
            className={`mt-2 w-full h-10 px-3 border rounded-md font-mono-num text-[14px] focus:outline-none transition-colors ${
              phone === "" ? "border-[var(--color-border)] focus:border-[var(--color-primary)]"
              : valid ? "border-[var(--color-success)]"
              : "border-[var(--color-destructive)]"
            }`}
          />
          {phone && !valid && (
            <p className="text-[11px] text-[var(--color-destructive)] mt-1">Use E.164 format: +CountryCode + digits.</p>
          )}
        </div>

        <div className="flex gap-3">
          <button
            disabled={!valid}
            onClick={() => runTest("sms")}
            className="flex-1 h-10 rounded-md border border-[var(--color-primary)] text-[var(--color-primary)] text-[13px] disabled:opacity-40"
          >
            {test.sms === "loading" ? "Sending…" : test.sms === "ok" ? "✓ Sent" : "Send test SMS"}
          </button>
          <button
            disabled={!valid}
            onClick={() => runTest("call")}
            className="flex-1 h-10 rounded-md border border-[var(--color-primary)] text-[var(--color-primary)] text-[13px] disabled:opacity-40"
          >
            {test.call === "loading" ? "Calling…" : test.call === "ok" ? "✓ Placed" : "Trigger test call"}
          </button>
        </div>

        <button
          disabled={!valid}
          onClick={() => toast.success("Contact saved")}
          className="w-full h-11 rounded-md bg-[var(--color-primary)] text-white text-[14px] disabled:opacity-40"
        >
          Save contact
        </button>

        <p className="text-[11px] text-[var(--color-text-muted)]">
          Your number is used exclusively for threshold alerts via TextBee and ElevenLabs. It is never shared.
        </p>
      </div>
    </div>
  );
}

function AppearanceCard() {
  const { theme, setTheme, fontSize, setFontSize, animations, setAnimations } = useTheme();
  const themeOptions: { value: "light" | "dark"; label: string; icon: typeof Sun }[] = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
  ];
  const sizeOptions: { value: "sm" | "md" | "lg" | "xl"; label: string; px: string }[] = [
    { value: "sm", label: "Small", px: "13px" },
    { value: "md", label: "Default", px: "14px" },
    { value: "lg", label: "Large", px: "16px" },
    { value: "xl", label: "X-Large", px: "18px" },
  ];

  return (
    <div className="space-y-6">
      <div className="reef-card p-6">
        <h3 className="font-display text-lg">Theme</h3>
        <p className="text-[13px] text-[var(--color-text-muted)] mt-1">Choose how Coralytics looks to you.</p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          {themeOptions.map((o) => {
            const Icon = o.icon;
            const active = theme === o.value;
            return (
              <button
                key={o.value}
                onClick={() => setTheme(o.value)}
                className={`flex items-center gap-3 p-4 rounded-lg border transition-colors text-left ${
                  active
                    ? "border-[var(--color-primary)] bg-[var(--color-accent-soft)]"
                    : "border-[var(--color-border)] hover:bg-[var(--color-surface-raised)]"
                }`}
              >
                <Icon size={18} strokeWidth={1.5} className={active ? "text-[var(--color-primary)]" : "text-[var(--color-text-secondary)]"} />
                <span className="text-[14px]">{o.label}</span>
                {active && <Check size={14} strokeWidth={1.5} className="ml-auto text-[var(--color-primary)]" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="reef-card p-6">
        <h3 className="font-display text-lg">Text size</h3>
        <p className="text-[13px] text-[var(--color-text-muted)] mt-1">Scales the entire interface.</p>
        <div className="mt-6 grid grid-cols-4 gap-2">
          {sizeOptions.map((o) => {
            const active = fontSize === o.value;
            return (
              <button
                key={o.value}
                onClick={() => setFontSize(o.value)}
                className={`flex flex-col items-center justify-center gap-1 p-3 rounded-lg border transition-colors ${
                  active
                    ? "border-[var(--color-primary)] bg-[var(--color-accent-soft)]"
                    : "border-[var(--color-border)] hover:bg-[var(--color-surface-raised)]"
                }`}
              >
                <span style={{ fontSize: o.px }} className="font-display leading-none">Aa</span>
                <span className="text-[11px] text-[var(--color-text-secondary)]">{o.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="reef-card p-6">
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <h3 className="font-display text-lg">Motion & data flow</h3>
            <p className="text-[13px] text-[var(--color-text-muted)] mt-1">
              Animate buttons, cards, and shimmer numeric data as it streams.
            </p>
          </div>
          <button
            onClick={() => setAnimations(!animations)}
            role="switch"
            aria-checked={animations}
            className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 ${
              animations ? "bg-[var(--color-primary)]" : "bg-[var(--color-border)]"
            }`}
          >
            <span
              className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                animations ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
