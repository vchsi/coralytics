import { useEffect, useRef, useState } from "react";
import { MessageSquare, X, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";

type Msg = { role: "user" | "assistant"; content: string };

const INITIAL_ASSISTANT: Msg = {
  role: "assistant",
  content:
    "Hi! I can help you understand coral bleaching, explain metrics like DHW or SSTA, or answer questions about your reef data. What would you like to know?",
};

const SUGGESTIONS = [
  "What is DHW?",
  "Why is SSTA important?",
  "Explain bleaching risk levels",
];

export function FloatingChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([INITIAL_ASSISTANT]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  const send = async (textArg?: string) => {
    const text = (textArg ?? input).trim();
    if (!text || streaming) return;
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setStreaming(true);

    let assistantSoFar = "";
    setMessages((m) => [...m, { role: "assistant", content: "" }]);

    try {
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      if (!resp.ok || !resp.body) {
        let errMsg = "Chat failed";
        try {
          const j = await resp.json();
          errMsg = j.error || errMsg;
        } catch {}
        toast.error(errMsg);
        setMessages((m) => m.slice(0, -1));
        setStreaming(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let done = false;

      const pushDelta = (delta: string) => {
        assistantSoFar += delta;
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: assistantSoFar };
          return copy;
        });
      };

      while (!done) {
        const { done: d, value } = await reader.read();
        if (d) break;
        buffer += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line || line.startsWith(":")) continue;
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") {
            done = true;
            break;
          }
          try {
            const parsed = JSON.parse(json);
            const c = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (c) pushDelta(c);
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chat failed");
      setMessages((m) => m.slice(0, -1));
    } finally {
      setStreaming(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const showSuggestions = messages.length === 1;

  return (
    <>
      {!open && (
        <div className="fixed bottom-6 right-6 z-50 group">
          <div
            role="tooltip"
            className="hidden [@media(hover:hover)]:block pointer-events-none absolute right-full top-1/2 -translate-y-1/2 mr-3 whitespace-nowrap px-3 py-1.5 rounded-lg bg-[var(--color-surface-raised)] border border-[var(--color-border)] text-[13px] text-[var(--color-text-primary)] opacity-0 translate-x-1 transition-all duration-150 group-hover:opacity-100 group-hover:translate-x-0"
            style={{ boxShadow: "0 6px 18px rgba(0,0,0,0.25)" }}
          >
            Talk to me if you need any help!
            <span
              aria-hidden
              className="absolute top-1/2 -translate-y-1/2 -right-1 w-2 h-2 rotate-45 bg-[var(--color-surface-raised)] border-r border-t border-[var(--color-border)]"
            />
          </div>
          <button
            onClick={() => setOpen(true)}
            aria-label="Open chat"
            className="w-11 h-11 rounded-full bg-[var(--coral)] text-white grid place-items-center transition-transform duration-200 hover:scale-105"
            style={{ boxShadow: "0 8px 24px color-mix(in oklab, var(--coral) 45%, transparent)" }}
          >
            <MessageSquare size={18} strokeWidth={1.75} />
          </button>
        </div>
      )}

      {open && (
        <div
          className="fixed z-50 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl flex flex-col overflow-hidden"
          style={{
            bottom: 24,
            right: 24,
            width: "min(380px, calc(100vw - 32px))",
            height: "min(520px, calc(100vh - 48px))",
            boxShadow: "0 12px 40px rgba(0, 0, 0, 0.35)",
            animation: "chat-pop 250ms cubic-bezier(0.22, 1, 0.36, 1)",
            transformOrigin: "bottom right",
          }}
        >
          <style>{`
            @keyframes chat-pop {
              from { opacity: 0; transform: scale(0.92) translateY(8px); }
              to { opacity: 1; transform: scale(1) translateY(0); }
            }
          `}</style>

          {/* Header */}
          <div className="flex items-start justify-between p-4 border-b border-[var(--color-border)]">
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-[var(--color-accent-soft)] grid place-items-center shrink-0">
                <Sparkles size={16} className="text-[var(--color-primary)]" strokeWidth={1.75} />
              </div>
              <div>
                <div className="font-display text-[15px] text-[var(--color-text-primary)] leading-tight">
                  Ask Coralytics
                </div>
                <div className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                  Ask anything about coral reefs, bleaching, or your data.
                </div>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="w-7 h-7 rounded-md grid place-items-center text-[var(--color-text-muted)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-[var(--color-primary)] text-white rounded-br-sm"
                      : "bg-[var(--color-surface-raised)] text-[var(--color-text-primary)] rounded-bl-sm"
                  }`}
                >
                  {m.content || (
                    <span className="inline-flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-text-muted)] dot-pulse" />
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-text-muted)] dot-pulse" style={{ animationDelay: "0.2s" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-text-muted)] dot-pulse" style={{ animationDelay: "0.4s" }} />
                    </span>
                  )}
                </div>
              </div>
            ))}

            {showSuggestions && (
              <div className="flex flex-wrap gap-2 pt-1">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    disabled={streaming}
                    className="text-[11px] px-3 py-1.5 rounded-full border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-primary)] transition-colors disabled:opacity-40"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-3 border-t border-[var(--color-border)]">
            <div className="flex gap-2 items-end">
              <textarea
                ref={taRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                rows={1}
                placeholder="Ask about reef health, metrics, or data..."
                disabled={streaming}
                className="flex-1 resize-none max-h-32 px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] text-[13px] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)] transition-colors"
              />
              <button
                onClick={() => send()}
                disabled={streaming || !input.trim()}
                aria-label="Send message"
                className="h-9 w-9 shrink-0 rounded-lg bg-[var(--color-primary)] text-white grid place-items-center disabled:opacity-40 transition-opacity"
              >
                <Send size={15} strokeWidth={1.75} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
