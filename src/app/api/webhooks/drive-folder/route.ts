import { kv } from "@vercel/kv";
import type { CoachingClient } from "@/lib/coaching-types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const secret = req.headers.get("x-webhook-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
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

  const email = body.email?.toLowerCase().trim();
  if (!email || !body.folderId) return new Response("Missing fields", { status: 400 });

  const clientKey = `sns:coaching:client:${email}`;
  const client = await kv.get<CoachingClient>(clientKey);

  // Make may fire before the Stripe webhook creates the client — just ack and move on
  if (!client) return new Response("ok", { status: 200 });

  // Only fill driveFolder if not already set by the direct Stripe webhook
  if (!client.driveFolder) {
    await kv.set(clientKey, {
      ...client,
      driveFolder: {
        id:                     body.folderId,
        url:                    body.folderUrl ?? `https://drive.google.com/drive/folders/${body.folderId}`,
        idVerificationFolderId: body.idVerificationFolderId ?? "",
        onboardingFolderId:     body.onboardingFolderId ?? "",
        notesFolderId:          "",
        docs:                   {},
      },
    } satisfies CoachingClient);
  }

  return new Response("ok", { status: 200 });
}
