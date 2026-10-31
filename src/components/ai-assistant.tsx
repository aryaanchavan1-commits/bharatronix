"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Loader2, Sparkles, CircleHelp } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  text: string;
}

const WELCOME =
  "Hi, I'm the Bharatrontech assistant. I can help you pick the right ERP suite, compare plans, understand licensing, or walk you through checkout. Ask me anything about manufacturing, retail, finance, HR, GST, pricing, migrations, or support.";

export function AiAssistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [open, setOpen] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  function scrollToBottom() {
    setTimeout(() => chatRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{ role: "assistant", text: WELCOME }]);
    }
    scrollToBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || typing) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text }]);
    setTyping(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Assistant unavailable");
      }
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: data.response ?? data.text ?? "" },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text:
            err instanceof Error
              ? err.message
              : "Assistant unavailable right now. Try again in a moment.",
        },
      ]);
    } finally {
      setTyping(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="relative">
      {/* trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="group fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-saffron-500 text-white shadow-xl shadow-saffron-500/30 transition-all hover:bg-saffron-600 hover:scale-105 sm:bottom-8 sm:right-8"
        aria-label="Toggle AI assistant"
      >
        {open ? (
          <CircleHelp className="h-6 w-6" />
        ) : (
          <Sparkles className="h-6 w-6" />
        )}
        <span className="sr-only">{open ? "Close assistant" : "Open AI assistant"}</span>
      </button>

      {/* panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-[380px] flex-col rounded-2xl border border-white/10 bg-ink-950 px-4 py-4 shadow-2xl shadow-black/50 sm:bottom-8 sm:right-8 sm:w-[420px]">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-teal-glow" />
              <span className="font-display text-sm font-bold text-white">Bharatrontech AI</span>
              <span className="rounded-full bg-teal-600/20 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-teal-glow">
                Online
              </span>
            </div>
            <button
              onClick={() => {
                setOpen(false);
                setTimeout(() => setMessages([]), 200);
              }}
              className="rounded-md p-1 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
              aria-label="Close AI assistant"
            >
              <CircleHelp className="h-4 w-4 rotate-135" />
            </button>
          </div>

          <div ref={chatRef} className="mt-3 flex-1 overflow-y-auto scroll-smooth px-1">
            {messages.map((m, i) => (
              <div key={i} className={`mb-3 flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "rounded-br-md bg-saffron-500 text-white"
                      : "rounded-bl-md bg-ink-900/70 text-slate-100 border border-white/10"
                  }`}
                >
                  {m.role === "assistant" && <Bot className="inline mr-1 h-3.5 w-3.5 text-teal-glow align-middle" />}
                  {m.text}
                </div>
              </div>
            ))}
            {typing && (
              <div className="mb-3 flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl bg-ink-900/70 px-3.5 py-2.5 border border-white/10">
                  <Loader2 className="h-4 w-4 animate-spin text-teal-glow" />
                  <span className="text-xs text-slate-400">Thinking…</span>
                </div>
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="mt-3 flex gap-2"
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about ERP suites, pricing, GST, licensing…"
              rows={1}
              className="flex-1 resize-none rounded-xl bg-ink-900/70 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 border border-white/10 focus:outline-none focus:border-saffron-500"
              disabled={typing}
            />
            <button
              type="submit"
              disabled={!input.trim() || typing}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-saffron-500 text-white shadow-md transition-all hover:bg-saffron-600 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
