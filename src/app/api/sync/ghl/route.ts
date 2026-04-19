import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { syncGHL } from "@/lib/sync-runners";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const clientId = session.user.role === "admin" ? "admin" : session.user.clientId!;
  try {
    await syncGHL(clientId);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
