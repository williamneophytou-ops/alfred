import Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "./anthropic";
import { addTask } from "./tasks";
import { saveDocument } from "./storage";

const SUPPORTED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export function isSupportedDocumentType(mimeType: string): boolean {
  return SUPPORTED_MIME_TYPES.has(mimeType);
}

const extractTool: Anthropic.Tool = {
  name: "add_task",
  description:
    "Report whether this document contains an assignment, task, deadline, or event worth tracking, and if so, its details.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      found: {
        type: "boolean",
        description: "True if there's an actual actionable task/assignment/deadline/event in this document.",
      },
      title: { type: ["string", "null"] },
      description: { type: ["string", "null"], description: "Optional extra detail, or null." },
      due_at: {
        type: ["string", "null"],
        description: "ISO 8601 date-time if there's a due date/time, else null.",
      },
      priority: { type: "string", enum: ["urgent", "normal"] },
      type: { type: "string", enum: ["task", "event", "deadline", "recurring"] },
    },
    required: ["found", "title", "description", "due_at", "priority", "type"],
    additionalProperties: false,
  },
};

type ExtractedTask = {
  found: boolean;
  title: string | null;
  description: string | null;
  due_at: string | null;
  priority: "urgent" | "normal";
  type: "task" | "event" | "deadline" | "recurring";
};

export type ProcessResult = {
  taskCreated: boolean;
  taskId: string | null;
  message: string;
};

/**
 * Reads a file's actual content (PDF or image) via Claude, extracts a
 * task/deadline if there is one, saves it, and attaches the original file
 * to that task so it's viewable from the task's detail view.
 */
export async function processDocumentFile(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  source: string
): Promise<ProcessResult> {
  if (!isSupportedDocumentType(mimeType)) {
    return {
      taskCreated: false,
      taskId: null,
      message: `Unsupported file type for ${filename} (${mimeType}) — only PDF and common image formats are read.`,
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const base64 = buffer.toString("base64");

  const fileBlock =
    mimeType === "application/pdf"
      ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: base64 } }
      : {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: mimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
            data: base64,
          },
        };

  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    system:
      `Today is ${today}. You are Alfred, reviewing a document the user uploaded or received, ` +
      `filename "${filename}". Look for an assignment, task, deadline, or event — schoolwork often ` +
      "has a submission date, exam date, or 'due by' instruction somewhere on the page. Resolve " +
      "relative/partial dates against today. Call add_task with found=true and the details if there " +
      "is one, or found=false if this is just reading material with nothing actionable.",
    tools: [extractTool],
    tool_choice: { type: "tool", name: "add_task" },
    messages: [
      {
        role: "user",
        content: [fileBlock, { type: "text", text: `Filename: ${filename}` }],
      },
    ],
  });

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
  );
  const extracted = toolUse?.input as ExtractedTask | undefined;

  if (!extracted?.found || !extracted.title) {
    return {
      taskCreated: false,
      taskId: null,
      message: `No task or deadline found in ${filename}.`,
    };
  }

  const taskId = await addTask({
    title: extracted.title,
    description: extracted.description ?? undefined,
    due_at: extracted.due_at ?? undefined,
    priority: extracted.priority,
    type: extracted.type,
    source,
  });

  if (!taskId) {
    return { taskCreated: false, taskId: null, message: `Found a task in ${filename} but failed to save it.` };
  }

  const doc = await saveDocument(buffer, filename, mimeType, taskId);
  if (!doc) {
    return {
      taskCreated: true,
      taskId,
      message: `Added task "${extracted.title}" from ${filename}, but couldn't attach the file itself.`,
    };
  }

  return { taskCreated: true, taskId, message: `Added task "${extracted.title}" from ${filename}.` };
}
