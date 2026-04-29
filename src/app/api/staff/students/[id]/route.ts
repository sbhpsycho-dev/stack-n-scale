import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { type CoachingClient, type StudentProgress, type ProgressNote, STATUS_ORDER, type CoachingStatus } from "@/lib/coaching-types";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin" && session.user.role !== "staff") {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  const [client, progress] = await Promise.all([
    kv.get<CoachingClient>(`sns:coaching:client:${id}`),
    kv.get<StudentProgress>(`sns:progress:notes:${id}`),
  ]);

  if (!client) return new Response("Not found", { status: 404 });
  return Response.json({ ...client, progress: progress ?? null });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin" && session.user.role !== "staff") {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  const body = await req.json() as {
    note?: string;
    status?: CoachingStatus;
    coachAssigned?: string;
  };

  const client = await kv.get<CoachingClient>(`sns:coaching:client:${id}`);
  if (!client) return new Response("Not found", { status: 404 });

  // Update client fields
  if (body.status && STATUS_ORDER.includes(body.status)) {
    client.status = body.status;
  }
  if (body.coachAssigned !== undefined) {
    client.coachAssigned = body.coachAssigned;
  }
  await kv.set(`sns:coaching:client:${id}`, client);

  // Append progress note
  if (body.note?.trim()) {
    const existing = (await kv.get<StudentProgress>(`sns:progress:notes:${id}`)) ?? {
      ghlContactId: id,
      notes: [],
      lastUpdated: new Date().toISOString(),
    };
    const newNote: ProgressNote = {
      text: body.note.trim(),
      createdAt: new Date().toISOString(),
      author: session.user.name ?? "Staff",
    };
    const updated: StudentProgress = {
      ...existing,
      notes: [...existing.notes, newNote],
      lastUpdated: new Date().toISOString(),
    };
    await kv.set(`sns:progress:notes:${id}`, updated);

    // Fire a notification
    const notifKey = `sns:notifications:staff:${Date.now()}`;
    await kv.set(notifKey, {
      id: notifKey,
      message: `Note added for ${client.name}`,
      link: `/staff/students/${id}`,
      createdAt: new Date().toISOString(),
      read: false,
      type: "student_update",
    }, { ex: 86400 * 7 });
  }

  return Response.json({ ok: true });
}
