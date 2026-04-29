import { kv } from "@vercel/kv";
import { createContact } from "@/lib/ghl";
import { setupClientFolder } from "@/lib/drive";
import type { CoachingClient } from "@/lib/coaching-types";

export const runtime = "nodejs";

// Fanbasis sends this payload shape via Make.com HTTP module.
// If Make creates the Drive folders itself, pass the IDs here and the
// app will skip creating them a second time.
export type FanbasisPayload = {
  email: string;
  name: string;           // full name
  phone?: string;
  amount_cents: number;   // payment total in cents
  currency?: string;
  // Optional — populated by Make's Google Drive modules
  drive_folder_id?:                string;
  drive_folder_url?:               string;
  drive_id_verification_folder_id?: string;
  drive_onboarding_folder_id?:     string;
  drive_notes_folder_id?:          string;
};

export async function POST(req: Request) {
  // Optional secret check — set FANBASIS_WEBHOOK_SECRET in env to enable
  const secret = process.env.FANBASIS_WEBHOOK_SECRET;
  if (secret) {
    const provided = req.headers.get("x-webhook-secret");
    if (provided !== secret) return new Response("Unauthorized", { status: 401 });
  }

  let payload: FanbasisPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const email = payload.email?.toLowerCase().trim();
  const rawName = payload.name?.trim() ?? "";
  const phone = payload.phone ?? undefined;

  if (!email || !rawName) return new Response("Missing email or name", { status: 400 });

  const clientKey = `sns:coaching:client:${email}`;
  const existing = await kv.get<CoachingClient>(clientKey);

  // Idempotency — skip if already created (Fanbasis / Make can retry)
  if (existing) return new Response("ok", { status: 200 });

  const [firstName, ...rest] = rawName.split(" ");
  const lastName = rest.join(" ") || undefined;

  // 1. Create GHL contact
  let ghlContactId = "";
  try {
    const contact = await createContact({ firstName, lastName, email, phone, tags: ["coaching-client"] });
    ghlContactId = contact.id;
  } catch (e) {
    console.error("GHL createContact error:", e);
  }

  // 2. Google Drive folders
  // If Make already created the folders and passed the IDs, use those directly.
  // Otherwise fall back to creating them server-side via the service account.
  let driveFolder: CoachingClient["driveFolder"] = null;
  if (payload.drive_folder_id) {
    driveFolder = {
      id:                      payload.drive_folder_id,
      url:                     payload.drive_folder_url ?? `https://drive.google.com/drive/folders/${payload.drive_folder_id}`,
      idVerificationFolderId:  payload.drive_id_verification_folder_id ?? "",
      onboardingFolderId:      payload.drive_onboarding_folder_id ?? "",
      notesFolderId:           payload.drive_notes_folder_id ?? "",
      docs:                    {},
    };
  } else if (process.env.GOOGLE_DRIVE_CLIENTS_ROOT_FOLDER_ID) {
    try {
      const folders = await setupClientFolder(rawName);
      driveFolder = {
        url:                     folders.folderUrl,
        id:                      folders.folderId,
        idVerificationFolderId:  folders.idVerificationFolderId,
        onboardingFolderId:      folders.onboardingFolderId,
        notesFolderId:           folders.notesFolderId,
        docs:                    folders.docs,
      };
    } catch (e) {
      console.error("Drive folder setup error:", e);
    }
  }

  // 3. Store client record in KV
  const client: CoachingClient = {
    ghlContactId,
    name: rawName,
    email,
    phone,
    status: "payment_received",
    createdAt: new Date().toISOString(),
    idVerification: "pending",
    driveFolder,
  };
  await kv.set(clientKey, client);

  return new Response("ok", { status: 200 });
}
