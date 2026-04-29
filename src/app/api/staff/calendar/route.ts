import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { google } from "googleapis";
import { kv } from "@vercel/kv";
import { type StaffCalendarEvent } from "@/lib/staff-types";

function getCalendarAuth() {
  const client_email = process.env.GOOGLE_SA_EMAIL;
  const private_key = process.env.GOOGLE_SA_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!client_email || !private_key) throw new Error("Google service account credentials not configured");
  return new google.auth.GoogleAuth({
    credentials: { client_email, private_key },
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
  });
}

async function fetchGoogleEvents(calendarId: string): Promise<StaffCalendarEvent[]> {
  const auth = getCalendarAuth();
  const calendar = google.calendar({ version: "v3", auth });
  const now = new Date();
  const timeMin = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const timeMax = new Date(now.getFullYear(), now.getMonth() + 3, 0).toISOString();

  const res = await calendar.events.list({
    calendarId,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 250,
  });

  return (res.data.items ?? []).map((e) => ({
    id: e.id ?? crypto.randomUUID(),
    title: e.summary ?? "(No title)",
    start: e.start?.dateTime ?? e.start?.date ?? now.toISOString(),
    end: e.end?.dateTime ?? e.end?.date ?? now.toISOString(),
    allDay: !e.start?.dateTime,
    source: "google" as const,
    description: e.description ?? undefined,
    location: e.location ?? undefined,
  }));
}

async function fetchOutlookEvents(accessToken: string): Promise<StaffCalendarEvent[]> {
  const now = new Date();
  const startDateTime = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const endDateTime = new Date(now.getFullYear(), now.getMonth() + 3, 0).toISOString();

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${startDateTime}&endDateTime=${endDateTime}&$top=250&$orderby=start/dateTime`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return [];

  const data = await res.json() as { value: Array<{
    id: string; subject: string;
    start: { dateTime: string; timeZone: string };
    end: { dateTime: string; timeZone: string };
    isAllDay: boolean;
    bodyPreview?: string;
    location?: { displayName?: string };
  }> };

  return (data.value ?? []).map((e) => ({
    id: e.id,
    title: e.subject ?? "(No title)",
    start: e.start.dateTime,
    end: e.end.dateTime,
    allDay: e.isAllDay,
    source: "outlook" as const,
    description: e.bodyPreview ?? undefined,
    location: e.location?.displayName ?? undefined,
  }));
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin" && session.user.role !== "staff") {
    return new Response("Unauthorized", { status: 401 });
  }

  const events: StaffCalendarEvent[] = [];

  // Google Calendar via service account
  const calendarId = process.env.GOOGLE_CALENDAR_ID ?? "primary";
  try {
    const googleEvents = await fetchGoogleEvents(calendarId);
    events.push(...googleEvents);
  } catch {
    // Service account may not have calendar scope — return empty Google events
  }

  // Outlook via stored OAuth token
  try {
    const outlookToken = await kv.get<string>("sns:outlook:access_token");
    if (outlookToken) {
      const outlookEvents = await fetchOutlookEvents(outlookToken);
      events.push(...outlookEvents);
    }
  } catch {
    // Outlook not connected
  }

  events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  return Response.json(events);
}
