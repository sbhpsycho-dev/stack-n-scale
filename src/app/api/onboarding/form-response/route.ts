import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  const email = new URL(req.url).searchParams.get("email");
  if (!email) return Response.json(null);

  const data = await kv.get(`sns:onboarding:form:${email.toLowerCase()}`);
  return Response.json(data ?? null);
}
