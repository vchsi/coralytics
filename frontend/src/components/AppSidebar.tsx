import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity, Brain, Bell, Settings as SettingsIcon, Waves, Sparkles, Radio,
} from "lucide-react";
import { useEffect, useState } from "react";
import { subscribeLive, type WSStatus } from "@/lib/api";

const items = [
  { to: "/welcome", label: "Welcome", icon: Sparkles },
  { to: "/", label: "Live Dashboard", icon: Activity },
  { to: "/sensor", label: "Sensor Detail", icon: Radio },
  { to: "/predictions", label: "Predictions", icon: Brain },
  { to: "/alerts", label: "Alerts", icon: Bell },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

export function AppSidebar() {
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<WSStatus>("connecting");
  const path = useRouterState({ select: (r) => r.location.pathname });

  useEffect(() => subscribeLive(() => {}, setStatus), []);

  const dotColor =
    status === "live" ? "bg-[var(--color-primary)]"
    : status === "reconnecting" || status === "connecting" ? "bg-[var(--color-warm)]"
    : "bg-[var(--color-destructive)]";
  const statusLabel =
    status === "live" ? "Live feed" :
    status === "connecting" ? "Connecting" :
    status === "reconnecting" ? "Reconnecting" : "Offline";

  return (
    <aside
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      className="hidden md:flex flex-col bg-[var(--color-surface-raised)] border-r border-[var(--color-border)] transition-[width] duration-200 ease-out shrink-0 sticky top-0 self-start h-screen"
      style={{ width: expanded ? 220 : 64 }}
    >
      <div className="h-16 flex items-center gap-3 px-4 border-b border-[var(--color-border)]">
        <div className="w-8 h-8 rounded-lg bg-[var(--color-accent-soft)] grid place-items-center shrink-0">
          <Waves className="text-[var(--color-primary)]" size={18} strokeWidth={1.5} />
        </div>
        {expanded && (
          <span className="font-display text-[17px] tracking-tight text-[var(--color-text-primary)]">
            Coralytics
          </span>
        )}
      </div>

      <nav className="flex-1 py-4 flex flex-col gap-1 px-2">
        {items.map((it) => {
          const active = it.to === "/" ? path === "/" : path.startsWith(it.to);
          return (
            <Link
              key={it.to}
              to={it.to}
              className="relative group flex items-center gap-3 h-10 px-3 rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-accent-soft)] transition-colors"
              activeProps={{ className: "text-[var(--color-text-primary)]" }}
            >
              {active && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-[var(--color-primary)]" />
              )}
              <it.icon size={18} strokeWidth={1.5} className="shrink-0" />
              {expanded && <span className="text-[13px]">{it.label}</span>}
            </Link>
          );
        })}
      </nav>

    </aside>
  );
}
