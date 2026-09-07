import { getCalendarClient } from "./google";

export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string | null;
  location: string | null;
};

/** Real Google Calendar events (not Alfred's internal tasks) in a date range. */
export async function listCalendarEvents(
  startIso: string,
  endIso: string
): Promise<CalendarEvent[]> {
  const calendar = await getCalendarClient();

  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin: startIso,
    timeMax: endIso,
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 50,
  });

  return (res.data.items ?? []).map((event) => ({
    id: event.id ?? "",
    title: event.summary ?? "(no title)",
    start: event.start?.dateTime ?? event.start?.date ?? "",
    end: event.end?.dateTime ?? event.end?.date ?? null,
    location: event.location ?? null,
  }));
}

export type NewCalendarEvent = {
  title: string;
  description?: string;
  startIso: string; // ISO 8601 date-time
  endIso: string; // ISO 8601 date-time
  location?: string;
};

/** Creates a real event on the user's primary Google Calendar. */
export async function createCalendarEvent(
  event: NewCalendarEvent
): Promise<{ ok: boolean; link: string | null }> {
  const calendar = await getCalendarClient();

  try {
    const res = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: event.title,
        description: event.description,
        location: event.location,
        // No per-user timezone setting exists yet anywhere in the app — UTC
        // is used consistently with how due dates are handled elsewhere.
        start: { dateTime: event.startIso, timeZone: "UTC" },
        end: { dateTime: event.endIso, timeZone: "UTC" },
      },
    });
    return { ok: true, link: res.data.htmlLink ?? null };
  } catch (err) {
    console.error("Failed to create calendar event:", err);
    return { ok: false, link: null };
  }
}
