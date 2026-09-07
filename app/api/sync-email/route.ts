import { NextResponse } from "next/server";
import { fetchNewEmails, markEmailsSynced } from "@/lib/google";
import { runWithMemory } from "@/lib/anthropic";

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
    "anything with nothing to act on or remember. Each email lists any attachment filenames, but you cannot see " +
    "inside attachments yet — if an email looks important (e.g. a booking confirmation, ticket, or " +
    "invoice) and has an attachment, still capture whatever is in the visible subject/body, and " +
    "separately flag in your summary that it has an unread attachment worth checking manually. " +
    "After reviewing, reply with a short plain-English summary of what you found (a few bullet " +
    'points), or say "Nothing new to remember" if nothing qualified. Do not ask questions — just ' +
    "report."
  );
}

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
      systemPrompt(),
      [
        {
          role: "user",
          content: `Here are my emails, scanning ${windowLabel}:\n\n${digest}`,
        },
      ],
      { includeAllMemories: true, taskSource: "email" } // full visibility avoids duplicates; tag source
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
