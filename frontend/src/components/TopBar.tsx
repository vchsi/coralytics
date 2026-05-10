import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

const labels: Record<string, string> = {
  "/": "Live Sensor Dashboard",
  "/predictions": "Predictions & Risk",
  "/chat": "AI Research Chat",
  "/alerts": "Alert History & Logs",
  "/settings": "Settings",
};

export function TopBar() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const utc = now.toISOString().slice(11, 19) + " UTC";
  return (
    <header className="h-16 flex items-center justify-between px-6 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-center gap-2 text-[13px]">
        <span className="text-[var(--color-text-muted)]">Coralytics</span>
        <span className="text-[var(--color-text-muted)]">/</span>
        <span className="text-[var(--color-text-primary)]">{labels[path] ?? "Overview"}</span>
      </div>
      <div className="font-mono-num text-[12px] text-[var(--color-text-secondary)] tracking-wider">
        {utc}
      </div>
    </header>
  );
}
