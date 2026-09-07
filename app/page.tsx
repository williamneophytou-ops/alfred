"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type Section = {
  id: string;
  label: string;
  description: string;
};

const SECTIONS: Section[] = [
  {
    id: "chat",
    label: "Chat",
    description: "Talk to Alfred.",
  },
  {
    id: "memory",
    label: "Memory",
    description:
      "Store and retrieve key facts, deadlines, and commitments you've told Alfred.",
  },
  {
    id: "planning",
    label: "Daily Planning",
    description:
      "\"What should I do today?\" — a plan built from your stored tasks and commitments.",
  },
  {
    id: "tasks",
    label: "Task Capture",
    description:
      "Capture tasks and reminders in natural language — \"remind me to...\", \"I've got X tonight\".",
  },
  {
    id: "study",
    label: "Study Assistant",
    description:
      "Revision plans and task breakdowns for studying. Deprioritized to a later version.",
  },
];

// Shared card / accent styling — kept muted and consistent throughout.
const CARD = "rounded-2xl bg-white/[0.04] border border-white/10";
const ACCENT = "bg-indigo-600 hover:bg-indigo-500";

export default function Home() {
  const [activeSection, setActiveSection] = useState("chat");
  const [gmailStatus, setGmailStatus] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("gmail");
    if (status) {
      setGmailStatus(status);
      setActiveSection("memory");
      window.history.replaceState({}, "", "/");
    }
  }, []);

  const section = SECTIONS.find((s) => s.id === activeSection)!;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-300 to-slate-500 p-4 font-sans md:p-8">
      <div className="flex h-[calc(100vh-2rem)] w-full max-w-6xl flex-col overflow-hidden rounded-[2rem] bg-[#12152a] shadow-2xl md:h-[calc(100vh-4rem)]">
        <Header activeSection={activeSection} onSelect={setActiveSection} />
        <main className="flex flex-1 flex-col overflow-hidden">
          {activeSection === "chat" ? (
            <Chat />
          ) : activeSection === "memory" ? (
            <MemorySection gmailStatus={gmailStatus} />
          ) : activeSection === "planning" ? (
            <DailyPlanningSection />
          ) : (
            <Placeholder section={section} />
          )}
        </main>
      </div>
    </div>
  );
}

function Header({
  activeSection,
  onSelect,
}: {
  activeSection: string;
  onSelect: (id: string) => void;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-slate-800/60 px-5 py-4 md:px-8">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">
          A
        </div>
        <div>
          <div className="text-base font-semibold leading-tight text-white">Alfred</div>
          <div className="text-xs text-slate-400">Personal AI Assistant</div>
        </div>
      </div>
      <nav className="flex flex-wrap items-center gap-1 rounded-full bg-black/20 p-1">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors md:text-sm ${
              activeSection === s.id
                ? "bg-indigo-600 text-white"
                : "text-slate-300 hover:bg-white/5 hover:text-white"
            }`}
          >
            {s.label}
          </button>
        ))}
      </nav>
    </header>
  );
}

function MemorySection({ gmailStatus }: { gmailStatus: string | null }) {
  const section = SECTIONS.find((s) => s.id === "memory")!;
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  async function sync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/sync-email", { method: "POST" });
      const data = await res.json();
      setSyncResult(
        data.summary ?? data.error ?? "Sync finished with no summary."
      );
    } catch {
      setSyncResult("Something went wrong syncing email.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center overflow-y-auto px-6 py-10 text-center">
      <div className="w-full max-w-md">
        <div className={`${CARD} flex flex-col items-center gap-3 p-8`}>
          <h2 className="text-xl font-semibold text-white">{section.label}</h2>
          <p className="max-w-sm text-sm text-slate-400">{section.description}</p>

          {gmailStatus === "connected" && (
            <p className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300">
              Gmail connected successfully.
            </p>
          )}
          {gmailStatus === "error" && (
            <p className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-medium text-red-300">
              Something went wrong connecting Gmail. Try again.
            </p>
          )}
          {gmailStatus === "no_refresh_token" && (
            <p className="max-w-sm rounded-lg bg-amber-500/15 px-3 py-2 text-xs font-medium text-amber-300">
              Google didn&apos;t return a long-lived connection. Go to your Google
              Account&apos;s{" "}
              <a
                href="https://myaccount.google.com/connections"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                connected apps
              </a>{" "}
              settings, remove Alfred&apos;s access, then try connecting again.
            </p>
          )}

          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <a
              href="/api/auth/google"
              className={`rounded-full px-5 py-2 text-sm font-medium text-white ${ACCENT}`}
            >
              Connect Gmail
            </a>
            <button
              onClick={sync}
              disabled={syncing}
              className="rounded-full border border-white/15 px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {syncing ? "Syncing..." : "Sync Email (last 30 days)"}
            </button>
          </div>
        </div>

        {syncResult && (
          <div className={`${CARD} prose prose-sm prose-invert mt-4 max-w-none p-5 text-left text-slate-300`}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{syncResult}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

type PlanItem = {
  task_id: string | null;
  title: string;
  reason: string;
  time: string | null;
};

type TaskState = {
  status: "not_started" | "in_progress" | "done";
  priority: "urgent" | "normal";
};

type DailyPlan = {
  date: string;
  items: PlanItem[];
  generatedAt: string;
  tasks: Record<string, TaskState>;
};

function DailyPlanningSection() {
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);

  async function loadPlan() {
    setLoading(true);
    try {
      const res = await fetch("/api/daily-plan");
      const data = await res.json();
      setPlan(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPlan();
  }, []);

  async function regenerate() {
    setRegenerating(true);
    try {
      const res = await fetch("/api/daily-plan", { method: "POST" });
      const data = await res.json();
      setPlan(data);
    } finally {
      setRegenerating(false);
    }
  }

  async function toggleDone(item: PlanItem) {
    if (!item.task_id || !plan) return;
    const current = plan.tasks[item.task_id];
    const nextStatus = current?.status === "done" ? "not_started" : "done";

    setPlan({
      ...plan,
      tasks: {
        ...plan.tasks,
        [item.task_id]: { ...current, status: nextStatus, priority: current?.priority ?? "normal" },
      },
    });

    await fetch("/api/daily-plan", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: item.task_id, status: nextStatus }),
    });
  }

  async function flagUrgent(item: PlanItem) {
    if (!item.task_id || !plan) return;
    const current = plan.tasks[item.task_id];

    setPlan({
      ...plan,
      tasks: {
        ...plan.tasks,
        [item.task_id]: { ...current, priority: "urgent", status: current?.status ?? "not_started" },
      },
    });

    await fetch("/api/daily-plan", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: item.task_id, priority: "urgent" }),
    });
  }

  const section = SECTIONS.find((s) => s.id === "planning")!;
  const doneCount = plan
    ? plan.items.filter((i) => i.task_id && plan.tasks[i.task_id]?.status === "done").length
    : 0;

  return (
    <div className="flex flex-1 flex-col items-center overflow-y-auto px-6 py-8">
      <div className="w-full max-w-xl">
        <div className={`${CARD} mb-4 flex items-center justify-between p-5`}>
          <div>
            <h2 className="text-lg font-semibold text-white">{section.label}</h2>
            <p className="text-sm text-slate-400">
              {new Date().toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
              {plan && plan.items.length > 0 && ` · ${doneCount}/${plan.items.length} done`}
            </p>
          </div>
          <button
            onClick={regenerate}
            disabled={regenerating || loading}
            className={`rounded-full px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50 ${ACCENT}`}
          >
            {regenerating ? "Re-planning..." : "Re-plan day"}
          </button>
        </div>

        {loading && <p className="px-1 text-slate-400">Loading today&apos;s plan...</p>}

        {!loading && plan && plan.items.length === 0 && (
          <div className={`${CARD} p-6 text-center text-slate-400`}>
            Nothing tracked for today. Tell Alfred about a task, event, or deadline in Chat
            and it&apos;ll show up here.
          </div>
        )}

        {!loading && plan && plan.items.length > 0 && (
          <ol className="space-y-3">
            {plan.items.map((item, i) => {
              const state = item.task_id ? plan.tasks[item.task_id] : undefined;
              const done = state?.status === "done";
              const urgent = state?.priority === "urgent";
              return (
                <li
                  key={i}
                  className={`${CARD} flex items-start gap-3 p-4 ${done ? "opacity-50" : ""}`}
                >
                  {item.task_id ? (
                    <input
                      type="checkbox"
                      checked={done}
                      onChange={() => toggleDone(item)}
                      className="mt-1 h-4 w-4 accent-indigo-500"
                    />
                  ) : (
                    <span className="mt-1 h-4 w-4 shrink-0" />
                  )}
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`font-medium text-white ${done ? "line-through" : ""}`}>
                        {item.title}
                      </span>
                      {item.time && (
                        <span className="text-xs text-slate-400">{item.time}</span>
                      )}
                      {urgent && (
                        <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-medium text-red-300">
                          Urgent
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-400">{item.reason}</p>
                  </div>
                  {item.task_id && !urgent && (
                    <button
                      onClick={() => flagUrgent(item)}
                      className="shrink-0 rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-medium text-slate-400 hover:border-white/20 hover:text-white"
                    >
                      Mark urgent
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}

function Placeholder({ section }: { section: Section }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
      <div className={`${CARD} flex max-w-sm flex-col items-center gap-3 p-8`}>
        <h2 className="text-xl font-semibold text-white">{section.label}</h2>
        <p className="text-sm text-slate-400">{section.description}</p>
        <span className="mt-1 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-slate-300">
          Coming soon
        </span>
      </div>
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
        <div className="flex-1 space-y-3 overflow-y-auto">
          {messages.length === 0 && (
            <p className="px-1 text-slate-400">Say hello to get started.</p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                m.role === "user"
                  ? "ml-auto whitespace-pre-wrap bg-indigo-600 text-white"
                  : `prose prose-sm prose-invert max-w-none ${CARD} text-slate-200`
              }`}
            >
              {m.role === "user" ? (
                m.content
              ) : (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
              )}
            </div>
          ))}
          {loading && (
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-slate-400 ${CARD}`}>
              Thinking...
            </div>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <input
            className="flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder:text-slate-500 focus:border-indigo-500/50 focus:outline-none"
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
            className={`rounded-full px-5 py-2.5 font-medium text-white disabled:opacity-50 ${ACCENT}`}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
