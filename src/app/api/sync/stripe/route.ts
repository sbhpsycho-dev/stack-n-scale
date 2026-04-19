import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { syncStripe } from "@/lib/sync-runners";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role === "admin") return new Response("Unauthorized", { status: 401 });

  try {
    await syncStripe(session.user.clientId!);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
