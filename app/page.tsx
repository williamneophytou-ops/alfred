"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const BG_STORAGE_KEY = "alfred-bg-image";

/** Downscales/re-encodes an image file to a reasonably-sized JPEG data URL,
 * so a full-resolution photo doesn't blow past localStorage's quota. */
function fileToBackgroundDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not read that image."));
      img.onload = () => {
        const maxDim = 1920;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas not supported."));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

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
    label: "Tasks",
    description:
      "Everything Alfred is tracking — from chat, and automatically from your emails.",
  },
];

// Shared card / accent styling — kept muted and consistent throughout.
const CARD = "rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-md";
// The main shell: frosted, translucent "liquid glass" — a soft tint and
// heavy blur over whatever's behind it (the custom background image, if
// set), with a light inner rim to catch highlights like real glass does.
const GLASS_SHELL =
  "border border-white/20 bg-slate-950/60 backdrop-blur-3xl " +
  "shadow-[0_8px_32px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.18)]";
// A glassier, interactive variant for task list items — hover grows it
// slightly and adds a soft light-blue glow around the edge.
const TASK_CARD =
  "rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-md transition-all " +
  "duration-200 ease-out hover:scale-[1.02] hover:border-sky-400/50 " +
  "hover:shadow-[0_0_20px_2px_rgba(56,189,248,0.35)]";
const ACCENT = "bg-indigo-600 hover:bg-indigo-500";

export default function Home() {
  const [activeSection, setActiveSection] = useState("chat");
  const [gmailStatus, setGmailStatus] = useState<string | null>(null);
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [bgError, setBgError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("gmail");
    if (status) {
      setGmailStatus(status);
      setActiveSection("memory");
      window.history.replaceState({}, "", "/");
    }
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(BG_STORAGE_KEY);
      if (saved) setBgImage(saved);
    } catch {
      // Private browsing / storage disabled — just skip restoring a saved background.
    }
  }, []);

  async function handleBackgroundFile(file: File) {
    setBgError(null);
    try {
      const dataUrl = await fileToBackgroundDataUrl(file);
      setBgImage(dataUrl);
      try {
        window.localStorage.setItem(BG_STORAGE_KEY, dataUrl);
      } catch {
        setBgError("Background applied, but couldn't be saved for next time (storage full).");
      }
    } catch {
      setBgError("Couldn't use that image. Try a different file.");
    }
  }

  function resetBackground() {
    setBgImage(null);
    setBgError(null);
    try {
      window.localStorage.removeItem(BG_STORAGE_KEY);
    } catch {
      // Nothing to clean up if storage was never available.
    }
  }

  return (
    <div
      className={`flex min-h-screen items-center justify-center bg-cover bg-center p-4 font-sans md:p-8 ${
        bgImage ? "" : "bg-gradient-to-br from-slate-300 to-slate-500"
      }`}
      style={bgImage ? { backgroundImage: `url(${bgImage})` } : undefined}
    >
      <div
        className={`flex h-[calc(100vh-2rem)] w-full max-w-6xl flex-col overflow-hidden rounded-[2rem] md:h-[calc(100vh-4rem)] ${GLASS_SHELL}`}
      >
        <Header activeSection={activeSection} onSelect={setActiveSection} />
        <main className="flex flex-1 flex-col overflow-hidden">
          {activeSection === "chat" ? (
            <Chat />
          ) : activeSection === "memory" ? (
            <MemorySection gmailStatus={gmailStatus} />
          ) : activeSection === "planning" ? (
            <DailyPlanningSection />
          ) : (
            <TasksSection />
          )}
        </main>
      </div>

      <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-1.5">
        {bgError && (
          <p className="max-w-xs rounded-lg bg-red-500/15 px-3 py-1.5 text-xs text-red-300">
            {bgError}
          </p>
        )}
        <div className="flex items-center gap-1 rounded-full border border-white/10 bg-slate-800/80 p-1 backdrop-blur-md">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleBackgroundFile(file);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="rounded-full px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
          >
            {bgImage ? "Change background" : "Set background image"}
          </button>
          {bgImage && (
            <button
              onClick={resetBackground}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              Reset
            </button>
          )}
        </div>
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
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-black/30 px-5 py-4 backdrop-blur-2xl md:px-8">
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
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-200 ease-out hover:scale-105 hover:shadow-[0_0_16px_2px_rgba(56,189,248,0.4)] md:text-sm ${
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
              className="text-indigo-300 underline hover:text-indigo-200"
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
          <h2 className="text-lg font-semibold text-white">{section.label}</h2>
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
                      className="mt-1 h-4 w-4 accent-indigo-500"
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
                    <div className="space-y-2 border-t border-white/10 px-4 py-3 text-sm">
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
                          className="rounded-full border border-white/10 px-3 py-1 text-xs font-medium text-slate-400 hover:border-white/20 hover:text-white"
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
