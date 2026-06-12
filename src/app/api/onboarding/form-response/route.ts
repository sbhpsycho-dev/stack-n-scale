import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const allowed = ["admin", "staff", "sales_exec", "executive"];
  if (!session || !allowed.includes(session.user.role)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const email = new URL(req.url).searchParams.get("email");
  if (!email) return Response.json(null);

  const [data, signature] = await Promise.all([
    kv.get(`sns:onboarding:form:${email.toLowerCase()}`),
    kv.get<string>(`sns:onboarding:sig:form:${email.toLowerCase()}`),
  ]);
  if (!data) return Response.json(null);
  return Response.json({ ...data as object, signature: signature ?? null });
}
