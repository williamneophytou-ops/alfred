import { NextResponse } from "next/server";
import { fetchNewEmails, markEmailsSynced } from "@/lib/google";
import { runWithMemory } from "@/lib/anthropic";

const SYSTEM_PROMPT =
  "You are Alfred, a personal AI life assistant reviewing the user's recent emails. " +
  "Identify concrete facts worth remembering long-term: deadlines, appointments, deliveries, " +
  "invoices, event dates, commitments. Call the remember tool once per distinct fact — skip " +
  "anything already in the known facts below so you don't save duplicates. Ignore promotional " +
  "emails, newsletters, and anything with no actionable date or commitment. Each email lists any " +
  "attachment filenames, but you cannot see inside attachments yet — if an email looks important " +
  "(e.g. a booking confirmation, ticket, or invoice) and has an attachment, still remember whatever " +
  "is in the visible subject/body, and separately flag in your summary that it has an unread " +
  "attachment worth checking manually. After reviewing, reply with a short plain-English summary " +
  'of what you found (a few bullet points), or say "Nothing new to remember" if nothing qualified. ' +
  "Do not ask questions — just report.";

const FALLBACK_DAYS = 30;

export async function POST() {
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
          `Attachments: ${e.attachments.length > 0 ? e.attachments.join(", ") : "none"}\n` +
          `Content: ${e.snippet}`
      )
      .join("\n\n---\n\n");

    const summary = await runWithMemory(
      SYSTEM_PROMPT,
      [
        {
          role: "user",
          content: `Here are my emails, scanning ${windowLabel}:\n\n${digest}`,
        },
      ],
      { includeAllMemories: true } // need full visibility to avoid re-saving duplicates
    );

    // Only mark the checkpoint once Claude has actually processed these
    // emails — if this failed, we'd want to retry the same emails next time.
    await markEmailsSynced(syncedAt);

    return NextResponse.json({
      summary: `Scanned ${windowLabel}, ${emails.length} email(s).\n\n${summary}`,
      emailCount: emails.length,
    });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Sync failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
