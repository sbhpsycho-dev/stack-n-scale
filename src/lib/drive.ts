import { google } from "googleapis";
import { Readable } from "stream";

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

export async function uploadTextToDrive(folderId: string, fileName: string, content: string): Promise<string> {
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
}

export async function uploadFileToDrive(
  folderId: string,
  fileName: string,
  mimeType: string,
  buffer: ArrayBuffer | Buffer
): Promise<string> {
  const d = drive();
  const res = await d.files.create({
    requestBody: { name: fileName, parents: [folderId] },
    media: { mimeType, body: Readable.from(Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)) },
    fields: "id",
  });
  return res.data.id!;
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

export async function setupClientFolder(clientName: string): Promise<ClientDocs> {
  const root = await createFolder(`client - ${clientName}`, process.env.GOOGLE_DRIVE_CLIENTS_ROOT_FOLDER_ID!);

  // Create subfolders in parallel
  const [idFolder, onboardingFolder, notesFolder] = await Promise.all([
    createFolder("ID Verification", root.id),
    createFolder("Onboarding", root.id),
    createFolder("Notes", root.id),
  ]);

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
