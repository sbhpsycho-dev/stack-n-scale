import { kv } from "@vercel/kv";
import { setupClientFolder } from "@/lib/drive";
import { updateContact } from "@/lib/ghl";

export type GHLEvent =
  | "drive_folder_requested"
  | "onboarding_submitted"
  | "client_activated"
  | "id_submitted";

export type GHLWebhookBody = {
  event: GHLEvent;
  contactId: string;
  email: string;
  name?: string;
  phone?: string;
};

export async function POST(req: Request) {
  let body: GHLWebhookBody;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { event, contactId, email, name } = body;
  if (!event || !contactId || !email) {
    return new Response("Missing required fields", { status: 400 });
  }

  const clientKey = `sns:coaching:client:${email}`;

  if (event === "drive_folder_requested") {
    if (!name) return Response.json({ error: "name required for drive folder creation" }, { status: 400 });
    try {
      const existingRecord = (await kv.get<Record<string, unknown>>(clientKey)) ?? {};
      if (existingRecord.driveFolder) {
        return Response.json({ ok: true, skipped: "folder already exists" });
      }
      const { folderUrl, folderId, idVerificationFolderId, onboardingFolderId, docs } = await setupClientFolder(name);
      await updateContact(contactId, {
        customField: [{ id: "drive_folder_url", value: folderUrl }],
      });
      const existing = (await kv.get<Record<string, unknown>>(clientKey)) ?? {};
      await kv.set(clientKey, {
        ...existing,
        status: "id_verified",
        driveFolder: { url: folderUrl, id: folderId, idVerificationFolderId, onboardingFolderId, docs },
      });
      return Response.json({ ok: true, folderUrl });
    } catch (err) {
      console.error("Drive folder error:", err);
      return Response.json({ ok: false, error: String(err) }, { status: 500 });
    }
  }

  if (event === "id_submitted") {
    const existing = (await kv.get<Record<string, unknown>>(clientKey)) ?? {};
    await kv.set(clientKey, {
      ...existing,
      idVerification: "submitted",
      status: "id_pending_review",
    });
    return Response.json({ ok: true });
  }

  if (event === "onboarding_submitted") {
    const existing = (await kv.get<Record<string, unknown>>(clientKey)) ?? {};
    await kv.set(clientKey, { ...existing, status: "onboarding_complete" });
    return Response.json({ ok: true });
  }

  if (event === "client_activated") {
    const existing = (await kv.get<Record<string, unknown>>(clientKey)) ?? {};
    await kv.set(clientKey, {
      ...existing,
      status: "active",
      activeDate: new Date().toISOString(),
    });
    return Response.json({ ok: true });
  }

  return Response.json({ ok: true, event, note: "no handler for this event" });
}
