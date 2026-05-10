import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Line, LineChart, ResponsiveContainer } from "recharts";
import { ArrowRight } from "lucide-react";

export const Route = createFileRoute("/welcome")({
  head: () => ({
    meta: [
      { title: "Coralytics — Listen to the reef, in real time" },
      { name: "description", content: "Real-time coral reef monitoring with AI-driven bleaching risk prediction." },
      { property: "og:title", content: "Coralytics — Listen to the reef, in real time" },
      { property: "og:description", content: "Real-time coral reef monitoring with AI-driven bleaching risk prediction." },
    ],
  }),
  component: WelcomePage,
});

/* ---------- shatter text: chars repel from cursor ---------- */
function ShatterText({
  text,
  style,
  className,
  splitBy = "char",
  intensity = 22,
}: {
  text: string;
  style?: React.CSSProperties;
  className?: string;
  splitBy?: "char" | "word";
  intensity?: number;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (!fine) return;
    const parts = Array.from(el.querySelectorAll<HTMLSpanElement>("[data-ch]"));
    const state = parts.map(() => ({ x: 0, y: 0, r: 0, tx: 0, ty: 0, tr: 0 }));
    let raf = 0;
    let mouseX = -9999, mouseY = -9999, active = 0, targetActive = 0;
    const radius = splitBy === "word" ? 240 : 220;

    const onMove = (e: MouseEvent) => { mouseX = e.clientX; mouseY = e.clientY; targetActive = 1; };
    const onLeave = () => { targetActive = 0; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseleave", onLeave);

    const tick = () => {
      active += (targetActive - active) * 0.08;
      parts.forEach((c, i) => {
        const rect = c.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = cx - mouseX;
        const dy = cy - mouseY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const s = state[i];
        if (dist < radius && active > 0.01) {
          const f = Math.pow(1 - dist / radius, 2) * active;
          const ang = Math.atan2(dy, dx);
          s.tx = Math.cos(ang) * f * intensity;
          s.ty = Math.sin(ang) * f * intensity;
          s.tr = (dx > 0 ? 1 : -1) * f * (splitBy === "word" ? 6 : 14);
        } else {
          s.tx = 0; s.ty = 0; s.tr = 0;
        }
        s.x += (s.tx - s.x) * 0.18;
        s.y += (s.ty - s.y) * 0.18;
        s.r += (s.tr - s.r) * 0.18;
        c.style.transform = `translate3d(${s.x.toFixed(2)}px, ${s.y.toFixed(2)}px, 0) rotate(${s.r.toFixed(2)}deg)`;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
    };
  }, [text, splitBy, intensity]);

  if (splitBy === "word") {
    const words = text.split(/(\s+)/);
    return (
      <span ref={ref} className={className} style={style} aria-label={text}>
        {words.map((w, i) =>
          /^\s+$/.test(w) ? (
            <span key={i}>{w}</span>
          ) : (
            <span
              key={i}
              data-ch
              style={{ display: "inline-block", willChange: "transform", transition: "transform 80ms linear" }}
            >
              {w}
            </span>
          )
        )}
      </span>
    );
  }

  return (
    <span ref={ref} className={className} style={style} aria-label={text}>
      {text.split("").map((ch, i) =>
        ch === " " ? (
          <span key={i}>&nbsp;</span>
        ) : (
          <span
            key={i}
            data-ch
            style={{ display: "inline-block", willChange: "transform", transition: "transform 80ms linear" }}
          >
            {ch}
          </span>
        )
      )}
    </span>
  );
}

/* ---------- coral reef icon (replaces pink dot) ---------- */
function CoralIcon({ size = 18, className, style }: { size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      style={style}
      fill="var(--coral)"
      stroke="var(--coral)"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* base / trunk */}
      <path d="M13 30 Q16 26 19 30 Z" stroke="none" />
      <path d="M16 29 V22" />
      {/* main branches */}
      <path d="M16 24 Q12 21 10 16 Q9 13 11 11" />
      <path d="M16 24 Q20 21 22 16 Q23 13 21 11" />
      <path d="M16 22 Q16 17 16 12 Q16 9 18 7" />
      {/* side branches */}
      <path d="M11.5 16 Q9 15 7.5 13" />
      <path d="M20.5 16 Q23 15 24.5 13" />
      <path d="M13 19 Q11 19 9.5 18" />
      <path d="M19 19 Q21 19 22.5 18" />
      {/* polyp tips */}
      <circle cx="11" cy="11" r="1.6" stroke="none" />
      <circle cx="21" cy="11" r="1.6" stroke="none" />
      <circle cx="18" cy="7" r="1.6" stroke="none" />
      <circle cx="7.5" cy="13" r="1.3" stroke="none" />
      <circle cx="24.5" cy="13" r="1.3" stroke="none" />
      <circle cx="9.5" cy="18" r="1.1" stroke="none" />
      <circle cx="22.5" cy="18" r="1.1" stroke="none" />
      <circle cx="16" cy="12" r="1.3" stroke="none" />
    </svg>
  );
}

/* ---------- decorative coral flourish ---------- */
function CoralFlourish({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 200 200"
      className={className}
      style={style}
      fill="none"
      stroke="var(--coral)"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M100 190 V120" />
      <path d="M100 150 C 80 140, 70 120, 65 95" />
      <path d="M100 140 C 120 130, 132 110, 138 85" />
      <path d="M100 125 C 88 115, 82 100, 80 80" />
      <path d="M100 120 C 115 110, 122 95, 124 75" />
      <path d="M65 95 C 60 80, 58 65, 60 50" />
      <path d="M65 95 C 50 88, 42 78, 38 65" />
      <path d="M138 85 C 144 70, 146 55, 144 42" />
      <path d="M138 85 C 152 80, 162 70, 168 58" />
      <path d="M80 80 C 72 70, 68 58, 68 48" />
      <path d="M124 75 C 130 65, 132 52, 130 40" />
      <circle cx="60" cy="50" r="2" />
      <circle cx="38" cy="65" r="1.5" />
      <circle cx="68" cy="48" r="1.5" />
      <circle cx="144" cy="42" r="2" />
      <circle cx="168" cy="58" r="1.5" />
      <circle cx="130" cy="40" r="1.5" />
    </svg>
  );
}

/* ---------- count-up hook ---------- */
function useCountUp(target: number, duration = 1000) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

/* ---------- random-walk series ---------- */
function useRandomWalk(
  seed: number,
  opts: { min: number; max: number; step: number; len?: number; intervalMs?: number },
) {
  const { min, max, step, len = 32, intervalMs = 900 } = opts;
  const [data, setData] = useState(() => {
    const arr: { v: number }[] = [];
    let v = (min + max) / 2 + (seed % 7) * 0.1;
    for (let i = 0; i < len; i++) {
      v += (Math.random() - 0.5) * step;
      v = Math.max(min, Math.min(max, v));
      arr.push({ v });
    }
    return arr;
  });
  useEffect(() => {
    const id = setInterval(() => {
      setData((prev) => {
        const last = prev[prev.length - 1].v;
        let next = last + (Math.random() - 0.5) * step;
        next = Math.max(min, Math.min(max, next));
        return [...prev.slice(1), { v: next }];
      });
    }, intervalMs);
    return () => clearInterval(id);
  }, [min, max, step, intervalMs]);
  return data;
}

/* ---------- tween hook: smoothly animate a number toward a target ---------- */
function useTween(target: number, duration = 600) {
  const [val, setVal] = useState(target);
  const fromRef = useRef(target);
  const startRef = useRef(0);
  useEffect(() => {
    fromRef.current = val;
    startRef.current = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - startRef.current) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(fromRef.current + (target - fromRef.current) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);
  return val;
}

/* ---------- mini tile ---------- */
function MiniTile({
  label, unit, color, fmt, data, delayMs, colorFn,
}: {
  label: string; unit: string; color: string;
  fmt: (n: number) => string;
  data: { v: number }[];
  delayMs: number;
  colorFn?: (n: number) => string;
}) {
  const last = data[data.length - 1].v;
  const tweened = useTween(last, 600);
  const valueColor = colorFn ? colorFn(last) : "var(--color-text-primary)";
  return (
    <div
      className="reef-card p-4 opacity-0 translate-y-2"
      style={{ animation: `tile-in 600ms cubic-bezier(0.22, 1, 0.36, 1) ${delayMs}ms forwards` }}
    >
      <div className="label-eyebrow">{label}</div>
      <div className="mt-2 flex items-baseline gap-2 relative">
        {colorFn && (
          <span
            aria-hidden
            className="absolute -inset-1 rounded-md pointer-events-none"
            style={{
              background: `radial-gradient(ellipse at left center, ${valueColor} 0%, transparent 70%)`,
              opacity: 0.2,
              filter: "blur(8px)",
              transition: "background 600ms ease-out",
            }}
          />
        )}
        <span
          className="font-mono-num text-2xl tabular-nums relative"
          style={{ color: valueColor, transition: "color 600ms ease-out" }}
        >
          {fmt(tweened)}
        </span>
        <span className="text-xs text-[var(--color-text-muted)] relative">{unit}</span>
      </div>
      <div className="h-12 mt-2 -mx-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5}
              dot={false} isAnimationActive={false} strokeLinecap="round" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ---------- "updated Ns ago" ticker ---------- */
function useTimeAgo(resetKey: unknown) {
  const [secs, setSecs] = useState(0);
  useEffect(() => { setSecs(0); }, [resetKey]);
  useEffect(() => {
    const id = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return secs === 0 ? "just now" : `updated ${secs}s ago`;
}

/* ---------- severity color helpers ---------- */
const riskColor = (n: number) => {
  if (n < 25) return "#10B981";
  if (n < 50) return "#F59E0B";
  if (n < 75) return "#F97316";
  return "#F08FA8";
};
const sstColor = (n: number) => {
  if (n < 1) return "#3DA9FC";
  if (n < 1.5) return "var(--color-text-primary)";
  return "#F08FA8";
};

/* ---------- ambient wave background ---------- */
function AmbientWaves() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const glowRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    let raf = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = width * dpr; canvas.height = height * dpr;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Mouse tracking — only on fine-pointer devices
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const mouse = { x: -9999, y: -9999, active: false };
    const smooth = { x: -9999, y: -9999, active: 0 }; // active: 0..1 lerped
    const parent = canvas.parentElement;
    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = (e.clientX - rect.left) * dpr;
      mouse.y = (e.clientY - rect.top) * dpr;
      mouse.active = true;
    };
    const onLeave = () => { mouse.active = false; };
    if (fine && parent) {
      parent.addEventListener("mousemove", onMove);
      parent.addEventListener("mouseleave", onLeave);
    }

    let t = 0;
    const getStroke = () => {
      const isDark = document.documentElement.classList.contains("dark");
      return isDark ? [34, 211, 238, 0.18] : [34, 211, 238, 0.22];
    };
    const influenceR = 460 * dpr;

    const draw = () => {
      const lerp = 0.14;
      smooth.x += (mouse.x - smooth.x) * lerp;
      smooth.y += (mouse.y - smooth.y) * lerp;
      smooth.active += ((mouse.active ? 1 : 0) - smooth.active) * 0.08;

      if (glowRef.current) {
        const cx = smooth.x / dpr;
        const cy = smooth.y / dpr;
        glowRef.current.style.transform = `translate3d(${cx - 200}px, ${cy - 200}px, 0)`;
        glowRef.current.style.opacity = String(smooth.active * 0.9);
      }

      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1.25 * dpr;

      // Reef-blue wave lines — distributed across the full height with extra density at the bottom
      const lines = 14;
      const [r, g, b, baseA] = getStroke();
      const breakR = 90 * dpr; // inside this radius, the line breaks apart
      for (let i = 0; i < lines; i++) {
        const phase = t * 0.0009 + i * 0.7;
        const amp = h * 0.045 + i * 3 * dpr;
        const norm = i / (lines - 1);
        const yBase = h * (0.18 + Math.pow(norm, 1.4) * 0.78);

        // Fade lines slightly as they go higher (reinforces depth)
        const depthBoost = 0.4 + 0.6 * (i / (lines - 1));
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${(baseA + i * 0.005) * depthBoost})`;

        let drawing = false; // are we currently inside an open path?
        ctx.beginPath();
        for (let x = 0; x <= w; x += 6 * dpr) {
          let y = yBase
            + Math.sin(x * 0.0035 + phase) * amp
            + Math.sin(x * 0.0011 - phase * 0.6) * amp * 0.4;

          let broken = false;
          if (smooth.active > 0.01) {
            const dx = x - smooth.x;
            const dy = y - smooth.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < influenceR) {
              const f = Math.pow(1 - dist / influenceR, 2);
              const ang = Math.atan2(dy, dx);
              const repel = f * 130 * dpr * smooth.active;
              // displace point away from cursor
              y += Math.sin(ang) * repel;
              // high-frequency jitter near cursor for a "shattering" feel
              y += Math.sin(x * 0.05 + t * 0.02) * f * 12 * dpr * smooth.active;
            }
            // Recompute distance with new y, also factor in horizontal proximity
            const ndx = x - smooth.x;
            const ndy = y - smooth.y;
            const ndist = Math.sqrt(ndx * ndx + ndy * ndy);
            // Break the line where it gets very close to the cursor
            if (ndist < breakR * (0.6 + smooth.active * 0.6)) {
              broken = true;
            }
          }

          if (broken) {
            // close current sub-path; next valid point will start a new one
            if (drawing) { ctx.stroke(); drawing = false; }
          } else {
            if (!drawing) { ctx.beginPath(); ctx.moveTo(x, y); drawing = true; }
            else ctx.lineTo(x, y);
          }
        }
        if (drawing) ctx.stroke();
      }
      t += 16;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      if (fine && parent) {
        parent.removeEventListener("mousemove", onMove);
        parent.removeEventListener("mouseleave", onLeave);
      }
    };
  }, []);
  return (
    <div ref={wrapRef} className="absolute inset-0 pointer-events-none" aria-hidden>
      <canvas ref={ref} className="absolute inset-0 w-full h-full" />
      <div
        ref={glowRef}
        className="absolute top-0 left-0 w-[400px] h-[400px] rounded-full will-change-transform"
        style={{
          background:
            "radial-gradient(circle, rgba(240, 143, 168, 0.15) 0%, transparent 70%)",
          opacity: 0,
          transition: "opacity 300ms ease",
          mixBlendMode: "screen",
        }}
      />
    </div>
  );
}

/* ---------- hero stat ---------- */
function HeroStat() {
  const v = useCountUp(50, 1200);
  const [done, setDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDone(true), 1250);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="flex flex-col items-center text-center">
      <div
        className="font-mono-num text-[var(--color-primary)] tabular-nums leading-none flex items-baseline justify-center"
        style={{ fontSize: "clamp(80px, 14vw, 144px)", letterSpacing: "-0.04em", fontWeight: 500 }}
      >
        <span
          style={{
            opacity: done ? 1 : 0,
            transition: "opacity 240ms ease-out",
            display: "inline-block",
            width: "0.55em",
          }}
        >
          ~
        </span>
        <span>{v}</span>
        <span style={{ opacity: done ? 1 : 0, transition: "opacity 240ms ease-out" }}>%</span>
      </div>
      <p className="mt-12 max-w-2xl text-lg md:text-xl leading-relaxed text-[var(--color-text-primary)]">
        Half of the world's coral reefs have been lost since 2009. The other half is at risk.
      </p>
      <div className="mt-6 text-[11px] md:text-xs uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
        Of the world's coral reefs lost to bleaching since 2009
      </div>
      <div className="mt-2 text-[10px] md:text-[11px] text-[var(--color-text-muted)]/60">
        Source: Global Coral Reef Monitoring Network, 2020
      </div>
    </div>
  );
}

function WelcomePage() {
  const ssta = useRandomWalk(1, { min: 0.6, max: 1.8, step: 0.05, intervalMs: 3000 });
  const dhw = useRandomWalk(2, { min: 2, max: 9, step: 0.1, intervalMs: 3000 });
  const risk = useRandomWalk(3, { min: 18, max: 92, step: 2, intervalMs: 3000 });
  const lastTick = ssta[ssta.length - 1].v + dhw[dhw.length - 1].v + risk[risk.length - 1].v;
  const updatedAgo = useTimeAgo(lastTick);

  return (
    <div className="relative w-full bg-[var(--color-bg)] overflow-hidden">
      {/* keyframes */}
      <style>{`
        @keyframes tile-in {
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes drift {
          0%   { transform: translate3d(-2%, -1%, 0); }
          50%  { transform: translate3d(2%, 1%, 0); }
          100% { transform: translate3d(-2%, -1%, 0); }
        }
        @keyframes live-pulse {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50%      { opacity: 1;   transform: scale(1.15); }
        }
        @keyframes scroll-bounce {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(4px); }
        }
      `}</style>

      {/* HERO SECTION */}
      <section className="relative min-h-screen w-full overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(900px 500px at 20% 20%, color-mix(in oklab, #22D3EE 14%, transparent), transparent 60%)," +
              "radial-gradient(700px 500px at 80% 70%, color-mix(in oklab, #F08FA8 12%, transparent), transparent 60%)," +
              "radial-gradient(600px 400px at 88% 8%, rgba(255, 248, 230, 0.08), transparent 70%)",
            animation: "drift 22s ease-in-out infinite",
            opacity: 0.85,
          }}
        />
        <AmbientWaves />

        {/* TOP NAV */}
        <nav className="relative z-10 border-b border-[color-mix(in_oklab,var(--color-text-primary)_5%,transparent)]">
          <div className="w-full max-w-[1180px] mx-auto px-6 md:px-10 py-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CoralIcon size={22} />
              <span className="font-mono text-[14px] uppercase tracking-[0.18em] text-[var(--color-text-primary)]">
                Coralytics
              </span>
            </div>
            <div className="hidden md:flex items-center gap-8 font-mono text-[12px] uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
              <Link to="/welcome" className="hover:text-[var(--reef-blue)] transition-colors">Overview</Link>
              <Link to="/" className="hover:text-[var(--reef-blue)] transition-colors">Dashboard</Link>
              <Link to="/predictions" className="hover:text-[var(--reef-blue)] transition-colors">Predictions</Link>
              <Link to="/settings" className="hover:text-[var(--reef-blue)] transition-colors">Settings</Link>
            </div>
          </div>
        </nav>

        <div className="relative w-full max-w-[1280px] mx-auto px-6 md:px-10 pb-20" style={{ paddingTop: "4vh" }}>
          {/* Eyebrow row + stage indicator */}
          <div className="mb-4">
            <div className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.15em] text-[var(--color-text-muted)]">
              <CoralIcon size={16} />
              <span>Coralytics 01 — Global Coral Monitoring</span>
            </div>
          </div>

          <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-10 lg:gap-16 items-start">
            {/* LEFT: headline + description + CTAs */}
            <div>
              <h1
                className="font-display text-[var(--color-text-primary)] hero-h1"
                style={{
                  lineHeight: 1.05,
                  letterSpacing: "-0.025em",
                  fontWeight: 500,
                }}
              >
                <ShatterText text="Listen to the reef," intensity={32} />
                <br />
                <ShatterText
                  text="in real time."
                  intensity={32}
                  style={{
                    fontStyle: "italic",
                    color: "var(--coral)",
                    fontWeight: 500,
                  }}
                />
              </h1>

              <div className="mt-8">
                <p className="hero-desc text-[var(--color-text-secondary)] leading-relaxed">
                  <ShatterText
                    splitBy="word"
                    intensity={14}
                    text="Coralytics continuously monitors ocean conditions surrounding coral reefs and translates raw sensor signals into clear, actionable insight — so you can act before bleaching happens, not after."
                  />
                </p>
              </div>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to="/"
                  className="inline-flex items-center gap-2 h-11 px-5 rounded-lg bg-[var(--coral)] text-white text-sm font-medium transition-all duration-200 hover:scale-[1.02]"
                  style={{ boxShadow: "0 0 0 0 rgba(255, 214, 224, 0)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 8px 28px rgba(255, 214, 224, 0.4)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 0 0 0 rgba(255, 214, 224, 0)"; }}
                >
                  Open Live Dashboard <ArrowRight size={16} />
                </Link>
                <Link
                  to="/predictions"
                  className="inline-flex items-center gap-2 h-11 px-5 rounded-lg border text-[var(--color-text-primary)] text-sm font-medium transition-colors"
                  style={{ borderColor: "color-mix(in oklab, var(--reef-blue) 30%, transparent)" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--reef-blue)";
                    e.currentTarget.style.backgroundColor = "color-mix(in oklab, var(--reef-blue) 8%, transparent)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "color-mix(in oklab, var(--reef-blue) 30%, transparent)";
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  See Predictions
                </Link>
              </div>
            </div>

            {/* RIGHT: live readings panel */}
            <aside className="reef-card p-5 backdrop-blur-sm bg-[color-mix(in_oklab,var(--color-surface)_75%,transparent)]">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--color-text-muted)]">
                  <CoralIcon
                    size={18}
                    style={{ animation: "live-pulse 2s ease-in-out infinite" }}
                  />
                  <span>Live Readings</span>
                </div>
                <div className="text-right">
                  <div className="font-mono text-[10px] text-[var(--color-text-muted)]">Reef #04-218</div>
                  <div className="font-mono text-[9px] text-[var(--color-text-muted)] opacity-70 mt-0.5">{updatedAgo}</div>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <MiniTile
                  label="SST Anomaly" unit="°C" color="var(--reef-blue)"
                  fmt={(n) => n.toFixed(2)} data={ssta} delayMs={0} colorFn={sstColor}
                />
                <MiniTile
                  label="Degree Heating Weeks" unit="DHW" color="var(--coral)"
                  fmt={(n) => n.toFixed(1)} data={dhw} delayMs={120}
                />
                <MiniTile
                  label="Bleaching Risk" unit="%" color="var(--reef-blue)"
                  fmt={(n) => Math.round(n).toString()} data={risk} delayMs={240} colorFn={riskColor}
                />
              </div>
            </aside>
          </div>
        </div>

        {/* Data attribution strip */}
        <div className="absolute bottom-14 left-0 right-0 px-6 text-center pointer-events-none">
          <div
            className="font-mono uppercase text-[var(--color-text-primary)]"
            style={{ fontSize: "11px", letterSpacing: "0.1em", opacity: 0.4 }}
          >
            Data · NOAA Coral Reef Watch · BCO-DMO Global Coral Bleaching Database · 41,361 Sites Tracked
          </div>
        </div>
      </section>

    </div>
  );
}
