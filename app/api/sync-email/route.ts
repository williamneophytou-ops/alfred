import { NextResponse } from "next/server";
import { fetchNewEmails, markEmailsSynced, downloadAttachment } from "@/lib/google";
import { runWithMemory } from "@/lib/anthropic";
import { processDocumentFile, isSupportedDocumentType } from "@/lib/documents";
import { requireSession } from "@/lib/session";

function systemPrompt(): string {
  const today = new Date().toISOString().slice(0, 10);
  return (
    `Today's date is ${today}. You are Alfred, a personal AI life assistant reviewing the user's ` +
    "recent emails. Call add_task for anything actionable the user needs to do — deadlines, " +
    "appointments, deliveries, event dates, bookings, or a plain action item with no date at all " +
    "(e.g. 'reply to this', 'send your student ID to reset MFA') — leave the date out if there " +
    "isn't one; it still belongs in the Tasks list, not just memory. Only use remember for passive " +
    "facts/preferences with nothing to act on. Skip anything already in the known facts or existing " +
    "tasks listed below so you don't create duplicates. Ignore promotional emails, newsletters, and " +
    "anything with nothing to act on or remember. PDF and image attachments are read separately and " +
    "any tasks found in them are added automatically, so don't guess at their contents — just work " +
    "from the visible subject/body. For other attachment types (not PDF/image), flag in your summary " +
    "if the email looks important and has one you can't see. After reviewing, reply with a short " +
    'plain-English summary of what you found (a few bullet points), or say "Nothing new to ' +
    'remember" if nothing qualified. Do not ask questions — just report.'
  );
}

const FALLBACK_DAYS = 30;

export async function POST() {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const { emails, windowLabel, syncedAt } = await fetchNewEmails(FALLBACK_DAYS);

    if (emails.length === 0) {
      await markEmailsSynced(syncedAt);
      return NextResponse.json({
        summary: `No new emails found (scanned ${windowLabel}).`,
        emailCount: 0,
      });
    }

    const digest = emails
      .map(
        (e, i) =>
          `Email ${i + 1}:\nFrom: ${e.from}\nSubject: ${e.subject}\nDate: ${e.date}\n` +
          `Attachments: ${
            e.attachments.length > 0 ? e.attachments.map((a) => a.filename).join(", ") : "none"
          }\n` +
          `Content: ${e.snippet}`
      )
      .join("\n\n---\n\n");

    const { reply: summary } = await runWithMemory(
      systemPrompt(),
      [
        {
          role: "user",
          content: `Here are my emails, scanning ${windowLabel}:\n\n${digest}`,
        },
      ],
      { includeAllMemories: true, taskSource: "email" } // full visibility avoids duplicates; tag source
    );

    // Separately, actually read any PDF/image attachments and extract tasks
    // from their real content (not just the filename).
    const attachmentNotes: string[] = [];
    for (const email of emails) {
      for (const att of email.attachments) {
        if (!isSupportedDocumentType(att.mimeType)) continue;
        try {
          const buffer = await downloadAttachment(email.messageId, att.attachmentId);
          const result = await processDocumentFile(buffer, att.filename, att.mimeType, "email");
          if (result.taskCreated) attachmentNotes.push(result.message);
        } catch (err) {
          console.error(`Failed to process attachment ${att.filename}:`, err);
        }
      }
    }

    // Only mark the checkpoint once everything has been fully processed — if
    // this failed partway, we'd want to retry the same emails next time.
    await markEmailsSynced(syncedAt);

    const attachmentSummary =
      attachmentNotes.length > 0
        ? `\n\nFrom attachments:\n${attachmentNotes.map((m) => `- ${m}`).join("\n")}`
        : "";

    return NextResponse.json({
      summary: `Scanned ${windowLabel}, ${emails.length} email(s).\n\n${summary}${attachmentSummary}`,
      emailCount: emails.length,
    });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Sync failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
