import { useEffect, useState } from "react";
import { subscribeLive, type WSStatus } from "@/lib/api";

export function ReconnectBanner() {
  const [status, setStatus] = useState<WSStatus>("connecting");
  useEffect(() => subscribeLive(() => {}, setStatus), []);
  if (status === "live") return null;
  const text =
    status === "offline" ? "Sensor feed offline."
    : status === "connecting" ? "Connecting to sensor feed..."
    : "Reconnecting to sensor feed...";
  return (
    <div className="h-10 flex items-center gap-2 px-6 bg-[#FFF8EE] text-[var(--color-warm)] text-[13px] border-b border-[var(--color-border)]">
      <span className="w-2 h-2 rounded-full bg-[var(--color-warm)] dot-pulse" />
      <span>{text}</span>
    </div>
  );
}
