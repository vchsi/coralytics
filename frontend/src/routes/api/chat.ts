import { createFileRoute } from "@tanstack/react-router";

const SYSTEM_PROMPT = `You are Coralytics's assistant, helping users understand coral reef health, bleaching, and ocean monitoring metrics. You have expertise in marine biology, sea surface temperature anomalies (SSTA), Degree Heating Weeks (DHW), and the BCO-DMO global coral bleaching dataset. Answer questions concisely and accurately. If a user asks about their specific reef data, explain what the metrics mean and how to interpret them.`;

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { messages } = (await request.json()) as {
            messages: { role: "user" | "assistant"; content: string }[];
          };
          const apiKey = process.env.LOVABLE_API_KEY;
          if (!apiKey) {
            return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }

          const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-3-flash-preview",
              messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
              stream: true,
            }),
          });

          if (!upstream.ok) {
            const text = await upstream.text();
            const status = upstream.status;
            const msg =
              status === 429
                ? "Rate limit exceeded — please try again in a moment."
                : status === 402
                  ? "AI credits exhausted — add credits in Settings → Workspace → Usage."
                  : `AI gateway error: ${text}`;
            return new Response(JSON.stringify({ error: msg }), {
              status,
              headers: { "Content-Type": "application/json" },
            });
          }

          return new Response(upstream.body, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
            },
          });
        } catch (e) {
          return new Response(
            JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
