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

  const [record, signature, fileIds] = await Promise.all([
    kv.get(`sns:onboarding:id-submit:${email.toLowerCase()}`),
    kv.get<string>(`sns:onboarding:sig:id:${email.toLowerCase()}`),
    kv.get<{ frontId: string; selfieId: string; signatureId: string | null; idFrontUrl: string | null; selfieUrl: string | null; signatureUrl: string | null }>(`sns:drive:file-ids:${email.toLowerCase()}`),
  ]);

  if (!record) return Response.json(null);
  return Response.json({ ...record as object, signature: signature ?? null, fileIds: fileIds ?? null });
}
