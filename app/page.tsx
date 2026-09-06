"use client";

import { useState } from "react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type Section = {
  id: string;
  label: string;
  icon: string;
  description: string;
};

const SECTIONS: Section[] = [
  {
    id: "chat",
    label: "Chat",
    icon: "💬",
    description: "Talk to Alfred.",
  },
  {
    id: "memory",
    label: "Memory",
    icon: "🧠",
    description:
      "Store and retrieve key facts, deadlines, and commitments you've told Alfred.",
  },
  {
    id: "planning",
    label: "Daily Planning",
    icon: "📅",
    description:
      "\"What should I do today?\" — a plan built from your stored tasks and commitments.",
  },
  {
    id: "tasks",
    label: "Task Capture",
    icon: "✍️",
    description:
      "Capture tasks and reminders in natural language — \"remind me to...\", \"I've got X tonight\".",
  },
  {
    id: "study",
    label: "Study Assistant",
    icon: "📚",
    description:
      "Revision plans and task breakdowns for studying. Deprioritized to a later version.",
  },
];

export default function Home() {
  const [activeSection, setActiveSection] = useState("chat");

  return (
    <div className="flex h-screen bg-zinc-50 font-sans dark:bg-black">
      <Sidebar activeSection={activeSection} onSelect={setActiveSection} />
      <main className="flex flex-1 flex-col min-w-0">
        {activeSection === "chat" ? (
          <Chat />
        ) : (
          <Placeholder
            section={SECTIONS.find((s) => s.id === activeSection)!}
          />
        )}
      </main>
    </div>
  );
}

function Sidebar({
  activeSection,
  onSelect,
}: {
  activeSection: string;
  onSelect: (id: string) => void;
}) {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-black/[.08] bg-white px-3 py-4 dark:border-white/[.08] dark:bg-zinc-950">
      <div className="mb-6 flex items-center gap-2 px-2">
        <span className="text-xl">🤖</span>
        <span className="text-lg font-semibold text-black dark:text-zinc-50">
          Alfred
        </span>
      </div>
      <nav className="flex flex-col gap-1">
        {SECTIONS.map((section) => (
          <button
            key={section.id}
            onClick={() => onSelect(section.id)}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
              activeSection === section.id
                ? "bg-black text-white dark:bg-zinc-50 dark:text-black"
                : "text-zinc-600 hover:bg-black/[.05] dark:text-zinc-400 dark:hover:bg-white/[.08]"
            }`}
          >
            <span>{section.icon}</span>
            {section.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}

function Placeholder({ section }: { section: Section }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
      <span className="text-4xl">{section.icon}</span>
      <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
        {section.label}
      </h2>
      <p className="max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
        {section.description}
      </p>
      <span className="mt-2 rounded-full bg-black/[.06] px-3 py-1 text-xs font-medium text-zinc-600 dark:bg-white/[.08] dark:text-zinc-400">
        Coming soon
      </span>
    </div>
  );
}

function Chat() {
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
        body: JSON.stringify({ messages: nextMessages }),
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
    <div className="flex flex-1 flex-col items-center overflow-hidden">
      <div className="flex w-full max-w-2xl flex-1 flex-col overflow-hidden px-4 py-6">
        <div className="flex-1 space-y-4 overflow-y-auto">
          {messages.length === 0 && (
            <p className="text-zinc-500 dark:text-zinc-400">
              Say hello to get started.
            </p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[80%] rounded-lg px-4 py-2 ${
                m.role === "user"
                  ? "ml-auto bg-black text-white dark:bg-zinc-50 dark:text-black"
                  : "bg-white text-black dark:bg-zinc-900 dark:text-zinc-50"
              }`}
            >
              {m.content}
            </div>
          ))}
          {loading && (
            <div className="max-w-[80%] rounded-lg bg-white px-4 py-2 text-zinc-500 dark:bg-zinc-900">
              Thinking...
            </div>
          )}
        </div>

        <div className="mt-4 flex gap-2">
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
