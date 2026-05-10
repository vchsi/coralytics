import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import { Toaster } from "sonner";
import { useEffect } from "react";

import appCss from "../styles.css?url";
import { AppSidebar } from "@/components/AppSidebar";
import { TopBar } from "@/components/TopBar";
import { ReconnectBanner } from "@/components/ReconnectBanner";
import { FloatingChat } from "@/components/FloatingChat";
import { ThemeProvider } from "@/lib/theme";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Coralytics — Live Reef Monitoring" },
      { name: "description", content: "Real-time ocean and coral reef sensor monitoring with AI risk prediction." },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Plus+Jakarta+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: () => (
    <div className="min-h-screen grid place-items-center">
      <div className="text-center">
        <h1 className="text-5xl font-display">404</h1>
        <p className="text-[var(--color-text-muted)] mt-2">Drift detected — page not found.</p>
      </div>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="reef-card p-8 max-w-md text-center">
        <h2 className="font-display text-xl">Something surfaced unexpectedly</h2>
        <p className="text-[var(--color-text-muted)] mt-2 text-sm">{error.message}</p>
      </div>
    </div>
  ),
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const root = document.documentElement;
    const enabled = () => root.getAttribute("data-animations") === "on";

    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("reveal-in");
            observer.unobserve(e.target);
          }
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" },
    );

    const scan = () => {
      if (!enabled()) {
        document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => {
          el.classList.add("reveal-in");
        });
        return;
      }
      const main = document.querySelector("main");
      if (!main) return;
      const candidates = main.querySelectorAll<HTMLElement>(
        ".reef-card, h1, h2, h3, section, [data-reveal]",
      );
      candidates.forEach((el) => {
        if (el.classList.contains("reveal-in") || el.dataset.revealBound) return;
        el.dataset.revealBound = "1";
        el.classList.add("reveal");
        observer.observe(el);
      });
    };

    const t = setTimeout(scan, 30);
    const mo = new MutationObserver(() => scan());
    const main = document.querySelector("main");
    if (main) mo.observe(main, { childList: true, subtree: true });

    return () => {
      clearTimeout(t);
      mo.disconnect();
      observer.disconnect();
    };
  }, [pathname]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
      <div className="min-h-screen flex w-full">
        {pathname !== "/welcome" && <AppSidebar />}
        <div className="flex-1 flex flex-col min-w-0">
          {pathname !== "/welcome" && <TopBar />}
          <ReconnectBanner />
          <main key={pathname} className={`route-enter flex-1 w-full mx-auto ${pathname === "/welcome" ? "" : "px-6 md:px-10 py-8 max-w-[1280px]"}`}>
            <Outlet />
          </main>
        </div>
      </div>
      <FloatingChat />
      <Toaster
        position="top-right"
        toastOptions={{
          classNames: {
            toast: "!bg-[var(--color-surface)] !text-[var(--color-text-primary)] !border !border-[var(--color-border)] !shadow-[var(--shadow-reef)] !rounded-xl",
            success: "!border-l-4 !border-l-[var(--color-primary)]",
            error: "!border-l-4 !border-l-[var(--color-destructive)]",
            warning: "!border-l-4 !border-l-[var(--color-warm)]",
          },
        }}
      />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
