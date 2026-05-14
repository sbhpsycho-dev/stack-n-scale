import { kv } from "@vercel/kv";
import type { CoachingClient } from "@/lib/coaching-types";
import { verifyWebhookSecret } from "@/lib/cron-auth";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email")?.toLowerCase().trim();

  if (!verifyWebhookSecret(req.headers.get("x-webhook-secret"))) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!email) {
    return Response.json({ ok: false, error: "Missing email" }, { status: 400 });
  }

  const client = await kv.get<CoachingClient>(`sns:coaching:client:${email}`);
  if (!client?.driveFolder) {
    return Response.json({ ok: false, error: "No folder found for this client" }, { status: 404 });
  }

  return Response.json({
    ok: true,
    folderId: client.driveFolder.id,
    folderUrl: client.driveFolder.url,
    onboardingFolderId: client.driveFolder.onboardingFolderId,
    idVerificationFolderId: client.driveFolder.idVerificationFolderId,
  });
}
