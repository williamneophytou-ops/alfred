"use client";

import { useState } from "react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: text },
    ];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();

      setMessages([
        ...nextMessages,
        { role: "assistant", content: data.reply ?? data.error ?? "No response." },
      ]);
    } catch {
      setMessages([
        ...nextMessages,
        { role: "assistant", content: "Something went wrong. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-screen items-center bg-zinc-50 font-sans dark:bg-black">
      <div className="flex flex-col w-full max-w-2xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50 mb-6">
          Alfred
        </h1>

        <div className="flex-1 overflow-y-auto space-y-4 mb-4">
          {messages.length === 0 && (
            <p className="text-zinc-500 dark:text-zinc-400">
              Say hello to get started.
            </p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`rounded-lg px-4 py-2 max-w-[80%] ${
                m.role === "user"
                  ? "ml-auto bg-black text-white dark:bg-zinc-50 dark:text-black"
                  : "bg-white text-black dark:bg-zinc-900 dark:text-zinc-50"
              }`}
            >
              {m.content}
            </div>
          ))}
          {loading && (
            <div className="rounded-lg px-4 py-2 max-w-[80%] bg-white text-zinc-500 dark:bg-zinc-900">
              Thinking...
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <input
            className="flex-1 rounded-full border border-black/[.08] px-4 py-2 dark:border-white/[.145] dark:bg-zinc-900 dark:text-zinc-50"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendMessage();
            }}
            placeholder="Message Alfred..."
          />
          <button
            onClick={sendMessage}
            disabled={loading}
            className="rounded-full bg-foreground px-5 py-2 text-background disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
