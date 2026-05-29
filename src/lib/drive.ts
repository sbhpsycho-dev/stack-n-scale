import { google } from "googleapis";
import { Readable } from "stream";
import { kv } from "@vercel/kv";
import type { CoachingClient } from "@/lib/coaching-types";

type DriveFolder = NonNullable<CoachingClient["driveFolder"]>;

function getAuth() {
  const client_email = process.env.GOOGLE_SA_EMAIL;
  const private_key = process.env.GOOGLE_SA_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!client_email || !private_key) throw new Error("Google service account credentials not configured");
  return new google.auth.GoogleAuth({
    credentials: { client_email, private_key },
    scopes: [
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/spreadsheets",
    ],
  });
}

function drive() {
  return google.drive({ version: "v3", auth: getAuth() });
}

async function createFolder(name: string, parentId: string): Promise<{ id: string; url: string }> {
  const d = drive();
  const res = await d.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
  });
  const id = res.data.id!;
  // Share with the admin email so Make.com (evan@stacknscale.co) can access it
  const shareEmail = process.env.GOOGLE_DRIVE_IMPERSONATE_EMAIL;
  if (shareEmail) {
    await d.permissions.create({
      fileId: id,
      requestBody: { type: "user", role: "writer", emailAddress: shareEmail },
      sendNotificationEmail: false,
    });
  }
  return { id, url: `https://drive.google.com/drive/folders/${id}` };
}

async function copyTemplate(templateId: string, destFolderId: string, newTitle: string): Promise<string> {
  const d = drive();
  const res = await d.files.copy({
    fileId: templateId,
    requestBody: { name: newTitle, parents: [destFolderId] },
    fields: "id",
  });
  return res.data.id!;
}

async function listTemplates(): Promise<{ id: string; name: string }[]> {
  if (!process.env.GOOGLE_DRIVE_TEMPLATE_FOLDER_ID) return [];
  const d = drive();
  const res = await d.files.list({
    q: `'${process.env.GOOGLE_DRIVE_TEMPLATE_FOLDER_ID}' in parents and trashed = false`,
    fields: "files(id,name)",
  });
  return (res.data.files ?? []).filter(
    (f): f is { id: string; name: string } => typeof f.id === "string" && typeof f.name === "string"
  );
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 2, baseMs = 400): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (e) {
      last = e;
      if (i < attempts - 1) await new Promise(r => setTimeout(r, baseMs * 2 ** i));
    }
  }
  throw last;
}

// Single Drive API call — no retry. Used by both upload functions below.
async function driveFileCreate(folderId: string, fileName: string, mimeType: string, buf: Buffer): Promise<string> {
  const d = drive();
  const res = await d.files.create({
    requestBody: { name: fileName, parents: [folderId] },
    media: { mimeType, body: Readable.from(buf) },
    fields: "id",
  });
  return res.data.id!;
}

export async function uploadTextToDrive(folderId: string, fileName: string, content: string): Promise<string> {
  return withRetry(async () => {
    const d = drive();
    const res = await d.files.create({
      requestBody: {
        name: fileName,
        mimeType: "application/vnd.google-apps.document",
        parents: [folderId],
      },
      media: { mimeType: "text/plain", body: Readable.from([content]) },
      fields: "id",
    });
    return res.data.id!;
  });
}

export async function uploadFileToDrive(
  folderId: string,
  fileName: string,
  mimeType: string,
  buffer: ArrayBuffer | Buffer
): Promise<string> {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  return withRetry(() => driveFileCreate(folderId, fileName, mimeType, buf));
}

// Explicit retry wrapper with exponential backoff (800ms, 1600ms).
// Calls driveFileCreate directly — does NOT nest inside uploadFileToDrive
// to avoid double-retry stacking that would exceed the function timeout.
export async function uploadFileToDriveWithRetry(
  folderId: string,
  fileName: string,
  buffer: Buffer,
  mimeType: string,
  retries = 2
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await driveFileCreate(folderId, fileName, mimeType, buffer);
    } catch (err) {
      lastError = err;
      if (attempt < retries - 1) {
        await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

export type ClientDocs = {
  folderUrl: string;
  folderId: string;
  idVerificationFolderId: string;
  onboardingFolderId: string;
  notesFolderId: string;
  docs: Record<string, string>;
};

export async function appendToSheet(spreadsheetId: string, row: string[], range = "Sheet1!A:L"): Promise<void> {
  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: "RAW",
    requestBody: { values: [row] },
  });
}

// Atomically get or create a client's Drive folder, preventing duplicate creation
// under concurrent form + ID submissions. Uses a KV setnx lock.
// Throws on failure — callers must not treat a missing folder as a non-fatal condition.
export async function getOrCreateDriveFolder(
  clientKey: string,
  clientName: string
): Promise<DriveFolder> {
  if (!process.env.GOOGLE_DRIVE_CLIENTS_ROOT_FOLDER_ID) {
    throw new Error(`GOOGLE_DRIVE_CLIENTS_ROOT_FOLDER_ID is not configured — cannot create Drive folder for ${clientName}`);
  }

  const fresh = await kv.get<CoachingClient>(clientKey);
  if (fresh?.driveFolder) return fresh.driveFolder;
  const cached = await kv.get<DriveFolder>(`sns:folder-cache:${clientKey}`);
  if (cached) return cached;

  const lockKey = `sns:folder-lock:${clientKey}`;
  const locked = await kv.set(lockKey, "1", { nx: true, ex: 60 });
  if (!locked) {
    for (let i = 0; i < 5; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const polled = await kv.get<CoachingClient>(clientKey);
      if (polled?.driveFolder) return polled.driveFolder;
    }
    throw new Error(`Drive folder creation timed out for ${clientKey} — folder lock held by concurrent request`);
  }

  try {
    let folders: ClientDocs;
    try {
      folders = await setupClientFolder(clientName);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to set up Drive folder for client "${clientName}": ${msg}`);
    }
    const driveFolder: DriveFolder = {
      url: folders.folderUrl,
      id: folders.folderId,
      idVerificationFolderId: folders.idVerificationFolderId,
      onboardingFolderId: folders.onboardingFolderId,
      notesFolderId: folders.notesFolderId,
      docs: folders.docs,
    };
    const client = await kv.get<CoachingClient>(clientKey);
    if (client) {
      await kv.set(clientKey, { ...client, driveFolder });
    } else {
      // Client record not yet created (e.g. GHL webhook still pending) — cache folder
      // separately so it's found next time without creating a duplicate.
      await kv.set(`sns:folder-cache:${clientKey}`, driveFolder, { ex: 60 * 60 * 24 * 7 });
    }
    return driveFolder;
  } finally {
    await kv.del(lockKey);
  }
}

export async function setupClientFolder(clientName: string): Promise<ClientDocs> {
  const root = await createFolder(`client - ${clientName}`, process.env.GOOGLE_DRIVE_CLIENTS_ROOT_FOLDER_ID!);

  // Create subfolders in parallel
  const [idFolder, onboardingFolder, agreementsFolder, notesFolder] = await Promise.all([
    createFolder("ID Verification Forms", root.id),
    createFolder("Onboarding Forms", root.id),
    createFolder("Other Client Agreements", root.id),
    createFolder("Notes", root.id),
  ]);
  void agreementsFolder; // created in Drive; ID not stored on the client record

  // Copy templates into root folder
  const templates = await listTemplates();
  const docs: Record<string, string> = {};
  await Promise.all(
    templates.map(async (t) => {
      const newId = await copyTemplate(t.id, root.id, `${clientName} — ${t.name}`);
      docs[t.name] = newId;
    })
  );

  return {
    folderId: root.id,
    folderUrl: root.url,
    idVerificationFolderId: idFolder.id,
    onboardingFolderId: onboardingFolder.id,
    notesFolderId: notesFolder.id,
    docs,
  };
}
