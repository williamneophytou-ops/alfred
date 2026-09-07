import { google, gmail_v1 } from "googleapis";
import { getSupabase } from "./supabase";

// Lazily created for the same reason as the Supabase client (see lib/supabase.ts):
// avoid reading env vars at module load time, which runs during the build.
export function getOAuthClient(redirectUri?: string) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
}

// One combined connection covers both Gmail and Calendar — re-consent is
// only needed when a new scope is added, not per-feature.
export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.events",
];

async function getAuthorizedClient() {
  const { data, error } = await getSupabase()
    .from("google_tokens")
    .select("refresh_token")
    .eq("id", "default")
    .single();

  if (error || !data) {
    throw new Error("Google account is not connected yet.");
  }

  const client = getOAuthClient();
  client.setCredentials({ refresh_token: data.refresh_token });
  return client;
}

async function getGmailClient() {
  return google.gmail({ version: "v1", auth: await getAuthorizedClient() });
}

export async function getCalendarClient() {
  return google.calendar({ version: "v3", auth: await getAuthorizedClient() });
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data, "base64url").toString("utf-8");
}

function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function findPartByMimeType(
  payload: gmail_v1.Schema$MessagePart | undefined,
  mimeType: string
): string {
  if (!payload) return "";
  if (payload.mimeType === mimeType && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = findPartByMimeType(part, mimeType);
      if (text) return text;
    }
  }
  return "";
}

function extractBodyText(payload: gmail_v1.Schema$MessagePart | undefined): string {
  const plain = findPartByMimeType(payload, "text/plain");
  if (plain) return plain;

  const html = findPartByMimeType(payload, "text/html");
  if (html) return stripHtml(html);

  return "";
}

export type AttachmentRef = {
  filename: string;
  mimeType: string;
  attachmentId: string;
};

function collectAttachments(
  payload: gmail_v1.Schema$MessagePart | undefined
): AttachmentRef[] {
  if (!payload) return [];
  const refs: AttachmentRef[] = [];
  if (payload.filename && payload.body?.attachmentId) {
    refs.push({
      filename: payload.filename,
      mimeType: payload.mimeType ?? "application/octet-stream",
      attachmentId: payload.body.attachmentId,
    });
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      refs.push(...collectAttachments(part));
    }
  }
  return refs;
}

export type EmailSummary = {
  subject: string;
  from: string;
  date: string;
  snippet: string;
  messageId: string;
  attachments: AttachmentRef[];
};

/** Downloads one attachment's raw bytes. */
export async function downloadAttachment(
  messageId: string,
  attachmentId: string
): Promise<Buffer> {
  const gmail = await getGmailClient();
  const res = await gmail.users.messages.attachments.get({
    userId: "me",
    messageId,
    id: attachmentId,
  });
  const data = res.data.data;
  if (!data) throw new Error("Attachment had no data.");
  return Buffer.from(data, "base64url");
}

const MAX_EMAILS = 100;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isQuotaError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes("Quota exceeded") || message.includes("429");
}

/** Fetches one message, retrying with backoff if Gmail's rate limit is hit. */
async function getMessageWithRetry(
  gmail: gmail_v1.Gmail,
  id: string,
  attempt = 0
): Promise<gmail_v1.Schema$Message> {
  try {
    const full = await gmail.users.messages.get({
      userId: "me",
      id,
      format: "full",
    });
    return full.data;
  } catch (err) {
    if (isQuotaError(err) && attempt < 4) {
      await sleep(1000 * 2 ** attempt); // 1s, 2s, 4s, 8s
      return getMessageWithRetry(gmail, id, attempt + 1);
    }
    throw err;
  }
}

async function getLastSyncTime(): Promise<Date | null> {
  const { data } = await getSupabase()
    .from("email_sync_state")
    .select("last_synced_at")
    .eq("id", "default")
    .maybeSingle();

  return data?.last_synced_at ? new Date(data.last_synced_at) : null;
}

/** Call once a sync's results have been fully processed and saved. */
export async function markEmailsSynced(syncedAt: Date) {
  const { error } = await getSupabase()
    .from("email_sync_state")
    .upsert({ id: "default", last_synced_at: syncedAt.toISOString() });
  if (error) console.error("Failed to update email sync checkpoint:", error);
}

export type FetchResult = {
  emails: EmailSummary[];
  windowLabel: string;
  /** Pass this to markEmailsSynced once processing succeeds. */
  syncedAt: Date;
};

/**
 * Fetches emails since the last successful sync, or the last `fallbackDays`
 * days if this is the first sync ever.
 */
export async function fetchNewEmails(fallbackDays: number): Promise<FetchResult> {
  const gmail = await getGmailClient();
  const lastSync = await getLastSyncTime();
  const syncedAt = new Date(); // captured before fetching, so nothing sent during this sync gets skipped next time

  const query = lastSync
    ? `after:${Math.floor(lastSync.getTime() / 1000)}`
    : `newer_than:${fallbackDays}d`;
  const windowLabel = lastSync
    ? `emails since your last sync (${lastSync.toLocaleString()})`
    : `the last ${fallbackDays} days (first sync)`;

  const messageRefs: gmail_v1.Schema$Message[] = [];
  let pageToken: string | undefined;

  do {
    const list = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: 100,
      pageToken,
    });
    messageRefs.push(...(list.data.messages ?? []));
    pageToken = list.data.nextPageToken ?? undefined;
  } while (pageToken && messageRefs.length < MAX_EMAILS);

  const results: EmailSummary[] = [];

  for (const msg of messageRefs.slice(0, MAX_EMAILS)) {
    if (!msg.id) continue;

    const full = await getMessageWithRetry(gmail, msg.id);
    await sleep(150); // stay well under Gmail's per-minute quota

    const headers = full.payload?.headers ?? [];
    const subject =
      headers.find((h) => h.name === "Subject")?.value ?? "(no subject)";
    const from =
      headers.find((h) => h.name === "From")?.value ?? "(unknown sender)";
    const date = headers.find((h) => h.name === "Date")?.value ?? "";

    const bodyText = extractBodyText(full.payload) || full.snippet || "";
    const attachments = collectAttachments(full.payload);

    results.push({
      subject,
      from,
      date,
      snippet: bodyText.slice(0, 1000),
      messageId: msg.id,
      attachments,
    });
  }

  return { emails: results, windowLabel, syncedAt };
}
