import { kv } from "@vercel/kv";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { setupClientFolder } from "@/lib/drive";
import type { CoachingClient } from "@/lib/coaching-types";

export async function POST(req: Request) {
  const cronSecret = req.headers.get("x-webhook-secret");
  if (cronSecret !== process.env.CRON_SECRET) {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "admin") {
      return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  const { email } = await req.json();
  if (!email) return Response.json({ ok: false, error: "Missing email" }, { status: 400 });

  const clientKey = `sns:coaching:client:${email.toLowerCase().trim()}`;
  const client = await kv.get<CoachingClient>(clientKey);
  if (!client) return Response.json({ ok: false, error: "Client not found" }, { status: 404 });
  if (client.driveFolder) return Response.json({ ok: true, message: "Folder already exists", driveFolder: client.driveFolder });

  const folders = await setupClientFolder(client.name);
  const driveFolder = {
    url: folders.folderUrl,
    id: folders.folderId,
    idVerificationFolderId: folders.idVerificationFolderId,
    onboardingFolderId: folders.onboardingFolderId,
    notesFolderId: folders.notesFolderId,
    docs: folders.docs,
  };
  await kv.set(clientKey, { ...client, driveFolder });

  return Response.json({ ok: true, driveFolder });
}
