"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type ComponentPayload =
  | {
      type: "task_list";
      data: {
        title: string;
        items: {
          id: string;
          title: string;
          due: string | null;
          status: string;
          priority: string;
        }[];
      };
    }
  | {
      type: "calendar";
      data: {
        title: string;
        range: { start: string; end: string };
        events: {
          id: string;
          title: string;
          start: string;
          end: string | null;
          type: string;
        }[];
      };
    };

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  component?: ComponentPayload | null;
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
    label: "Tasks",
    description:
      "Everything Alfred is tracking — from chat, and automatically from your emails.",
  },
];

// Shared card / accent styling — tactical HUD theme: dark panels with thin
// cyan-glow borders, evoking a Batcomputer-style command console.
const CARD = "rounded-xl bg-cyan-950/20 border border-cyan-400/20 backdrop-blur-md";
// The main shell: frosted glass over whatever's behind it (the custom
// background image, if set), with a cyan inner rim like a HUD panel edge.
const GLASS_SHELL =
  "border border-cyan-400/25 bg-slate-950/70 backdrop-blur-3xl " +
  "shadow-[0_8px_32px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(103,232,249,0.15)]";
// A glassier, interactive variant for task list items — hover grows it
// slightly and adds a glowing cyan edge, like a HUD element highlighting
// on focus.
const TASK_CARD =
  "rounded-xl border border-cyan-400/20 bg-cyan-950/25 backdrop-blur-md transition-all " +
  "duration-200 ease-out hover:scale-[1.02] hover:border-cyan-300/60 " +
  "hover:shadow-[0_0_20px_2px_rgba(34,211,238,0.4)]";
const ACCENT = "bg-cyan-600 hover:bg-cyan-500";
// Small uppercase technical label, matching the reference's "SYSTEM
// OVERVIEW" / "TACTICAL MAP" panel-header style.
const HUD_LABEL = "text-xs font-semibold uppercase tracking-wider text-cyan-400/80";

function renderSection(id: string, gmailStatus: string | null) {
  if (id === "chat") return <Chat />;
  if (id === "memory") return <MemorySection gmailStatus={gmailStatus} />;
  if (id === "planning") return <DailyPlanningSection />;
  return <TasksSection />;
}

function CornerBrackets() {
  const base = "pointer-events-none absolute h-6 w-6 border-cyan-400/40";
  return (
    <>
      <div className={`${base} left-3 top-3 rounded-tl-md border-l-2 border-t-2`} />
      <div className={`${base} right-3 top-3 rounded-tr-md border-r-2 border-t-2`} />
      <div className={`${base} bottom-3 left-3 rounded-bl-md border-b-2 border-l-2`} />
      <div className={`${base} bottom-3 right-3 rounded-br-md border-b-2 border-r-2`} />
    </>
  );
}

function DashboardWidget({
  section,
  onFocus,
  children,
}: {
  section: Section;
  onFocus: () => void;
  children: React.ReactNode;
}) {
  return (
    // Outer wrapper carries the hover grow + glow — it must NOT have
    // overflow-hidden, or the glow gets hard-clipped to a rectangle right
    // at its own edge (a self-inflicted "border" instead of a soft glow).
    // Clipping the actual content (for the rounded corners) happens on the
    // inner div instead.
    <div className="group h-64 rounded-xl transition-all duration-200 ease-out hover:z-10 hover:scale-[1.03] hover:shadow-[0_0_24px_4px_rgba(34,211,238,0.35)]">
      <div className="flex h-full flex-col overflow-hidden rounded-xl border border-cyan-400/20 bg-black/30 backdrop-blur-md transition-colors duration-200 ease-out group-hover:border-cyan-300/60">
        <div className="flex items-center justify-between border-b border-cyan-400/10 px-3 py-2">
          <span className="font-display text-xs font-semibold uppercase tracking-wider text-cyan-300">
            {section.label}
          </span>
          <button
            onClick={onFocus}
            className="rounded-full border border-cyan-400/30 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-cyan-200 transition-colors hover:bg-cyan-400/10"
          >
            Focus
          </button>
        </div>
        <div className="flex flex-1 flex-col overflow-y-auto p-3">{children}</div>
      </div>
    </div>
  );
}

function TimeWidget({ now }: { now: Date | null }) {
  return (
    // Same split as DashboardWidget: the glow lives on an outer wrapper
    // with no overflow-hidden, so it isn't clipped to a hard rectangle.
    <div className="rounded-xl transition-all duration-200 ease-out hover:scale-[1.03] hover:shadow-[0_0_24px_4px_rgba(34,211,238,0.35)]">
      <div className="flex flex-col overflow-hidden rounded-xl border border-cyan-400/20 bg-black/30 p-4 text-center backdrop-blur-md transition-colors duration-200 ease-out hover:border-cyan-300/60">
        <span className={`${HUD_LABEL} mb-2`}>System Clock</span>
        {now ? (
          <>
            <span className="font-display text-3xl tracking-wide text-cyan-300">
              {now.toLocaleTimeString()}
            </span>
            <span className="mt-1 text-xs uppercase tracking-wider text-cyan-100/60">
              {now.toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </span>
          </>
        ) : (
          <span className="font-display text-3xl text-cyan-300">--:--:--</span>
        )}
      </div>
    </div>
  );
}

export default function HomeClient() {
  const [primarySection, setPrimarySection] = useState("chat");
  const [gmailStatus, setGmailStatus] = useState<string | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("gmail");
    if (status) {
      setGmailStatus(status);
      setPrimarySection("memory");
      window.history.replaceState({}, "", "/");
    }
  }, []);

  const secondarySections = SECTIONS.filter((s) => s.id !== primarySection);
  const leftSections = secondarySections.slice(0, 1);
  const rightSections = secondarySections.slice(1);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-black p-4 font-sans md:p-8">
      <div
        className={`relative flex h-[calc(100vh-2rem)] w-full max-w-[1600px] flex-col overflow-hidden rounded-[2rem] md:h-[calc(100vh-4rem)] ${GLASS_SHELL}`}
      >
        <CornerBrackets />
        <Header primarySection={primarySection} onSelect={setPrimarySection} now={now} />
        <main className="grid flex-1 grid-cols-1 gap-4 overflow-hidden p-4 lg:grid-cols-[260px_1fr_260px]">
          <div className="flex flex-col gap-3 overflow-y-auto p-6">
            <TimeWidget now={now} />
            {leftSections.map((s) => (
              <DashboardWidget key={s.id} section={s} onFocus={() => setPrimarySection(s.id)}>
                {renderSection(s.id, gmailStatus)}
              </DashboardWidget>
            ))}
          </div>

          <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-cyan-400/25 bg-black/20 backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-cyan-400/10 px-4 py-2.5">
              <span className="font-display text-sm font-semibold uppercase tracking-wider text-cyan-300">
                {SECTIONS.find((s) => s.id === primarySection)!.label}
              </span>
              <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-cyan-400/60">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
                Primary
              </span>
            </div>
            <div className="flex flex-1 flex-col overflow-hidden">
              {renderSection(primarySection, gmailStatus)}
            </div>
          </div>

          <div className="flex flex-col gap-3 overflow-y-auto p-6">
            {rightSections.map((s) => (
              <DashboardWidget key={s.id} section={s} onFocus={() => setPrimarySection(s.id)}>
                {renderSection(s.id, gmailStatus)}
              </DashboardWidget>
            ))}
          </div>
        </main>

        <div className="flex items-center justify-between border-t border-cyan-400/10 bg-black/30 px-5 py-2 text-[10px] uppercase tracking-wider text-cyan-400/60">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            Alfred Online
          </span>
          {now && (
            <>
              <span>
                {now.toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </span>
              <span className="font-display">{now.toLocaleTimeString()}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Header({
  primarySection,
  onSelect,
  now,
}: {
  primarySection: string;
  onSelect: (id: string) => void;
  now: Date | null;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-cyan-400/20 bg-black/40 px-5 py-4 backdrop-blur-2xl md:px-8">
      <div className="flex items-center gap-3">
        <div>
          <div className="font-display text-base font-semibold leading-tight tracking-wide text-white">
            ALFRED
          </div>
          <div className={HUD_LABEL}>Personal AI Assistant</div>
        </div>
        {now && (
          <div className="ml-4 hidden border-l border-cyan-400/20 pl-4 font-display text-sm text-cyan-300 sm:block">
            {now.toLocaleTimeString()}
            <span className="ml-2 text-[10px] uppercase tracking-wider text-cyan-400/50">
              {now.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
            </span>
          </div>
        )}
      </div>
      <nav className="flex flex-wrap items-center gap-1 rounded-full border border-cyan-400/10 bg-black/30 p-1">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium uppercase tracking-wide transition-all duration-200 ease-out hover:scale-105 hover:shadow-[0_0_16px_2px_rgba(34,211,238,0.5)] md:text-sm ${
              primarySection === s.id
                ? "bg-cyan-600 text-black"
                : "text-cyan-100/70 hover:bg-white/5 hover:text-white"
            }`}
          >
            {s.label}
          </button>
        ))}
      </nav>
    </header>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
    </svg>
  );
}

function MemorySection({ gmailStatus }: { gmailStatus: string | null }) {
  const section = SECTIONS.find((s) => s.id === "memory")!;
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  // Whether a Google account is actually connected right now, checked against
  // the server (not just the one-off ?gmail=connected redirect flag, which
  // disappears on refresh). null while that check is still in flight.
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth/google/status")
      .then((res) => res.json())
      .then((data) => setGoogleConnected(!!data.connected))
      .catch(() => setGoogleConnected(false));
  }, []);

  useEffect(() => {
    if (gmailStatus === "connected") setGoogleConnected(true);
  }, [gmailStatus]);

  async function sync() {
    if (!window.confirm("Sync email now? Alfred will scan your recent inbox for new tasks and deadlines.")) {
      return;
    }
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
          <h2 className="text-xl font-semibold uppercase tracking-wide text-white">{section.label}</h2>
          <p className="max-w-sm text-sm text-slate-400">{section.description}</p>

          {gmailStatus === "connected" && (
            <p className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300">
              Google account connected successfully (Gmail + Calendar).
            </p>
          )}
          {gmailStatus === "error" && (
            <p className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-medium text-red-300">
              Something went wrong connecting your Google account. Try again.
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

          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            {googleConnected === true && gmailStatus !== "no_refresh_token" ? (
              <span className="flex items-center gap-2 rounded-full bg-emerald-500/15 px-4 py-2 text-sm font-medium text-emerald-300">
                <MailIcon />
                <CalendarIcon />
                Connected
              </span>
            ) : googleConnected === false || gmailStatus === "no_refresh_token" ? (
              <a
                href="/api/auth/google"
                className={`rounded-full px-5 py-2 text-sm font-medium text-white ${ACCENT}`}
              >
                Connect Gmail &amp; Calendar
              </a>
            ) : null}
            <button
              onClick={sync}
              disabled={syncing || googleConnected !== true}
              className="rounded-full border border-cyan-400/20 px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
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
            <h2 className="text-lg font-semibold uppercase tracking-wide text-white">{section.label}</h2>
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
                      className="mt-1 h-4 w-4 accent-cyan-500"
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
                      className="shrink-0 rounded-full border border-cyan-400/15 px-2.5 py-1 text-[11px] font-medium text-slate-400 hover:border-cyan-400/40 hover:text-white"
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

type Task = {
  id: string;
  title: string;
  description: string | null;
  due_at: string | null;
  status: "not_started" | "in_progress" | "done";
  priority: "urgent" | "normal";
  type: "task" | "event" | "deadline" | "recurring";
  source: string;
  created_at: string;
};

const SOURCE_LABEL: Record<string, string> = {
  chat: "From a conversation",
  email: "Found in your email",
  manual: "Added manually",
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type TaskDocument = {
  id: string;
  filename: string;
  url: string | null;
};

function TaskDocuments({ taskId }: { taskId: string }) {
  const [docs, setDocs] = useState<TaskDocument[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/documents?taskId=${taskId}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setDocs(data.documents ?? []);
      })
      .catch(() => {
        if (!cancelled) setDocs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  if (!docs || docs.length === 0) return null;

  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500">Files</span>
      <div className="flex flex-col items-end gap-1">
        {docs.map((doc) =>
          doc.url ? (
            <a
              key={doc.id}
              href={doc.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-300 underline hover:text-cyan-200"
            >
              {doc.filename}
            </a>
          ) : (
            <span key={doc.id} className="text-slate-500">
              {doc.filename}
            </span>
          )
        )}
      </div>
    </div>
  );
}

function TasksSection() {
  const section = SECTIONS.find((s) => s.id === "tasks")!;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadTasks() {
    setLoading(true);
    try {
      const res = await fetch("/api/tasks");
      const data = await res.json();
      setTasks(data.tasks ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTasks();
  }, []);

  async function uploadFile(file: File) {
    setUploading(true);
    setUploadMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/documents", { method: "POST", body: formData });
      const data = await res.json();
      setUploadMessage(data.message ?? data.error ?? "Upload finished.");
      if (data.taskCreated) await loadTasks();
    } catch {
      setUploadMessage("Something went wrong uploading that file.");
    } finally {
      setUploading(false);
    }
  }

  async function markDone(task: Task) {
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: task.id, status: "done" }),
    });
  }

  async function remove(task: Task) {
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    await fetch("/api/tasks", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: task.id }),
    });
  }

  return (
    <div className="flex flex-1 flex-col items-center overflow-y-auto px-6 py-8">
      <div className="w-full max-w-xl">
        <div className={`${CARD} mb-4 p-5`}>
          <h2 className="text-lg font-semibold uppercase tracking-wide text-white">{section.label}</h2>
          <p className="mb-3 text-sm text-slate-400">{section.description}</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadFile(file);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className={`rounded-full px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50 ${ACCENT}`}
          >
            {uploading ? "Reading..." : "Upload schoolwork / document"}
          </button>
          <p className="mt-1.5 text-xs text-slate-500">
            PDF or image — Alfred reads it, adds any due date as a task, and keeps the file
            attached to it.
          </p>
          {uploadMessage && <p className="mt-2 text-sm text-slate-300">{uploadMessage}</p>}
        </div>

        {loading && <p className="px-1 text-slate-400">Loading tasks...</p>}

        {!loading && tasks.length === 0 && (
          <div className={`${CARD} p-6 text-center text-slate-400`}>
            Nothing tracked yet. Just tell Alfred about something in Chat — a deadline, an
            appointment, anything with a date — and it&apos;ll show up here. He&apos;ll also add
            things he finds while syncing your email.
          </div>
        )}

        {!loading && tasks.length > 0 && (
          <ul className="space-y-3">
            {tasks.map((task) => {
              const expanded = expandedId === task.id;
              return (
                <li key={task.id} className={TASK_CARD}>
                  <div
                    className="flex cursor-pointer items-start gap-3 p-4"
                    onClick={() => setExpandedId(expanded ? null : task.id)}
                  >
                    <input
                      type="checkbox"
                      checked={false}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => markDone(task)}
                      className="mt-1 h-4 w-4 accent-cyan-500"
                    />
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-white">{task.title}</span>
                        {task.priority === "urgent" && (
                          <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-medium text-red-300">
                            Urgent
                          </span>
                        )}
                        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                          {task.type}
                        </span>
                      </div>
                      {task.due_at && (
                        <p className="text-xs text-slate-500">Due {formatDateTime(task.due_at)}</p>
                      )}
                    </div>
                    <span className="mt-1 text-xs text-slate-500">{expanded ? "Hide" : "Details"}</span>
                  </div>

                  {expanded && (
                    <div className="space-y-2 border-t border-cyan-400/15 px-4 py-3 text-sm">
                      <div className="flex justify-between gap-4">
                        <span className="text-slate-500">Description</span>
                        <span className="text-right text-slate-300">
                          {task.description ?? "—"}
                        </span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-slate-500">Due</span>
                        <span className="text-slate-300">
                          {task.due_at ? formatDateTime(task.due_at) : "No specific date"}
                        </span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-slate-500">Type</span>
                        <span className="text-slate-300">{task.type}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-slate-500">Priority</span>
                        <span className="text-slate-300">{task.priority}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-slate-500">Source</span>
                        <span className="text-slate-300">
                          {SOURCE_LABEL[task.source] ?? task.source}
                        </span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-slate-500">Added</span>
                        <span className="text-slate-300">{formatDateTime(task.created_at)}</span>
                      </div>
                      <TaskDocuments taskId={task.id} />
                      <div className="flex justify-end pt-1">
                        <button
                          onClick={() => remove(task)}
                          className="rounded-full border border-cyan-400/15 px-3 py-1 text-xs font-medium text-slate-400 hover:border-cyan-400/40 hover:text-white"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
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
        {
          role: "assistant",
          content: data.reply ?? data.error ?? "No response.",
          component: data.component ?? null,
        },
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
              className={`rounded-2xl px-4 py-2.5 ${
                m.component ? "max-w-[95%]" : "max-w-[80%]"
              } ${
                m.role === "user"
                  ? "ml-auto whitespace-pre-wrap bg-cyan-600 text-white"
                  : `prose prose-sm prose-invert max-w-none ${CARD} text-slate-200`
              }`}
            >
              {m.role === "user" ? (
                m.content
              ) : (
                <>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                  {m.component?.type === "task_list" && (
                    <GeneratedTaskList data={m.component.data} />
                  )}
                  {m.component?.type === "calendar" && (
                    <GeneratedCalendar data={m.component.data} />
                  )}
                </>
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
            className="min-w-0 flex-1 rounded-full border border-cyan-400/15 bg-white/5 px-4 py-2.5 text-white placeholder:text-slate-500 focus:border-cyan-500/50 focus:outline-none"
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
            className={`shrink-0 rounded-full px-5 py-2.5 font-medium text-white disabled:opacity-50 ${ACCENT}`}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function GeneratedTaskList({
  data,
}: {
  data: Extract<ComponentPayload, { type: "task_list" }>["data"];
}) {
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());

  async function toggleDone(id: string, currentlyDone: boolean) {
    setDoneIds((prev) => {
      const next = new Set(prev);
      if (currentlyDone) next.delete(id);
      else next.add(id);
      return next;
    });
    await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: id, status: currentlyDone ? "not_started" : "done" }),
    });
  }

  if (data.items.length === 0) {
    return (
      <div className="mt-3 rounded-xl border border-cyan-400/15 bg-cyan-950/20 p-4 text-sm text-slate-400">
        Nothing to show for &ldquo;{data.title}&rdquo;.
      </div>
    );
  }

  return (
    <div className="not-prose mt-3 rounded-xl border border-cyan-400/15 bg-cyan-950/20 p-3">
      <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {data.title}
      </p>
      <ul className="space-y-2">
        {data.items.map((item) => {
          const done = item.status === "done" || doneIds.has(item.id);
          return (
            <li
              key={item.id}
              className="flex items-center gap-2.5 rounded-lg bg-cyan-950/20 px-3 py-2"
            >
              <input
                type="checkbox"
                checked={done}
                onChange={() => toggleDone(item.id, done)}
                className="h-4 w-4 accent-cyan-500"
              />
              <span className={`flex-1 text-sm text-slate-200 ${done ? "line-through opacity-50" : ""}`}>
                {item.title}
              </span>
              {item.priority === "urgent" && !done && (
                <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-medium text-red-300">
                  Urgent
                </span>
              )}
              {item.due && (
                <span className="text-xs text-slate-500">{formatDateTime(item.due)}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function GeneratedCalendar({
  data,
}: {
  data: Extract<ComponentPayload, { type: "calendar" }>["data"];
}) {
  if (data.events.length === 0) {
    return (
      <div className="mt-3 rounded-xl border border-cyan-400/15 bg-cyan-950/20 p-4 text-sm text-slate-400">
        Nothing scheduled for &ldquo;{data.title}&rdquo;.
      </div>
    );
  }

  return (
    <div className="not-prose mt-3 rounded-xl border border-cyan-400/15 bg-cyan-950/20 p-3">
      <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {data.title}
      </p>
      <ul className="space-y-2">
        {data.events.map((event) => (
          <li
            key={event.id}
            className="flex items-center gap-2.5 rounded-lg bg-cyan-950/20 px-3 py-2"
          >
            <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-slate-400">
              {event.type}
            </span>
            <span className="flex-1 text-sm text-slate-200">{event.title}</span>
            <span className="text-xs text-slate-500">{formatDateTime(event.start)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
