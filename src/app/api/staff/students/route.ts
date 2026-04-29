import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { type CoachingClient } from "@/lib/coaching-types";
import { type StudentProgress } from "@/lib/coaching-types";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin" && session.user.role !== "staff") {
    return new Response("Unauthorized", { status: 401 });
  }

  const keys = await kv.keys("sns:coaching:client:*");
  if (!keys.length) return Response.json([]);

  const clients = await Promise.all(keys.map((k) => kv.get<CoachingClient>(k)));
  const validClients = clients.filter((c): c is CoachingClient => c !== null);

  const progressKeys = validClients.map((c) => `sns:progress:notes:${c.ghlContactId}`);
  const progressData = progressKeys.length
    ? await Promise.all(progressKeys.map((k) => kv.get<StudentProgress>(k)))
    : [];

  const result = validClients
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((client, i) => ({
      ...client,
      progress: progressData[i] ?? null,
    }));

  return Response.json(result);
}
