import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { type CoachingClient, type StudentProgress } from "@/lib/coaching-types";

export async function GET() {
  const session = await getServerSession(authOptions);
  const allowed = ["admin", "staff", "sales_exec", "executive"];
  if (!session || !allowed.includes(session.user.role)) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const keys = await kv.keys("sns:coaching:client:*");
    if (!keys.length) return Response.json([]);

    const clients = await Promise.all(keys.map((k) => kv.get<CoachingClient>(k)));
    const validClients = clients.filter((c): c is CoachingClient => c !== null);

    const progressKeys = validClients.map((c) => `sns:progress:notes:${c.ghlContactId}`);
    const progressData = progressKeys.length
      ? await Promise.all(progressKeys.map((k) => kv.get<StudentProgress>(k)))
      : [];

    // Build a Map before sorting so indices stay aligned
    const progressMap = new Map<string, StudentProgress | null>();
    for (let i = 0; i < validClients.length; i++) {
      progressMap.set(validClients[i].ghlContactId, progressData[i] ?? null);
    }

    const result = validClients
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map(client => ({
        ...client,
        progress: progressMap.get(client.ghlContactId) ?? null,
      }));

    return Response.json(result);
  } catch (err) {
    console.error("students route error:", err);
    return Response.json({ error: "Failed to load clients" }, { status: 500 });
  }
}
