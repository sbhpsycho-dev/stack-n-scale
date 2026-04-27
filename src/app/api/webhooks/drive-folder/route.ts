import { kv } from "@vercel/kv";
import type { CoachingClient } from "@/lib/coaching-types";

export async function POST(req: Request) {
  const secret = req.headers.get("x-webhook-secret");
  if (secret !== process.env.CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: {
    email?: string;
    folderId?: string;
    folderUrl?: string;
    idVerificationFolderId?: string;
    onboardingFolderId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { email, folderId, folderUrl, idVerificationFolderId, onboardingFolderId } = body;
  if (!email || !folderId) {
    return Response.json({ ok: false, error: "email and folderId required" }, { status: 400 });
  }

  const clientKey = `sns:coaching:client:${email.toLowerCase().trim()}`;
  const existing = (await kv.get<CoachingClient>(clientKey)) ?? {} as CoachingClient;

  await kv.set(clientKey, {
    ...existing,
    driveFolder: {
      id: folderId,
      url: folderUrl ?? `https://drive.google.com/drive/folders/${folderId}`,
      idVerificationFolderId: idVerificationFolderId ?? "",
      onboardingFolderId: onboardingFolderId ?? "",
      docs: existing.driveFolder?.docs ?? {},
    },
  });

  return Response.json({ ok: true });
}
