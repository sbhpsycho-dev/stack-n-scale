import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { list } from "@vercel/blob";

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

  // Lazy blob URL recovery: if the client submitted before blob URLs were persisted to KV,
  // look them up from Vercel Blob storage by deterministic path prefix and cache them back.
  let resolvedFileIds = fileIds ?? null;
  if (fileIds && !fileIds.idFrontUrl) {
    try {
      const slug = email.toLowerCase().replace(/[^a-z0-9]/g, "-");
      const [frontResult, selfieResult] = await Promise.all([
        list({ prefix: `id-verification/${slug}/id-front`, limit: 1 }),
        list({ prefix: `id-verification/${slug}/selfie`,   limit: 1 }),
      ]);
      resolvedFileIds = {
        ...fileIds,
        idFrontUrl:   frontResult.blobs[0]?.url  ?? null,
        selfieUrl:    selfieResult.blobs[0]?.url ?? null,
        signatureUrl: fileIds.signatureUrl ?? null,
      };
      // Cache back to KV so subsequent loads are instant
      kv.set(`sns:drive:file-ids:${email.toLowerCase()}`, resolvedFileIds).catch(() => {});
    } catch {
      // Blob list failure is non-fatal — fall back to Drive link placeholders
    }
  }

  return Response.json({ ...record as object, signature: signature ?? null, fileIds: resolvedFileIds });
}
