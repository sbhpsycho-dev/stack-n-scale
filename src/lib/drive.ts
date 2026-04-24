import { google } from "googleapis";

function getAuth() {
  const client_email = process.env.GOOGLE_SA_EMAIL;
  const private_key = process.env.GOOGLE_SA_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!client_email || !private_key) throw new Error("Google service account credentials not configured");
  return new google.auth.GoogleAuth({
    credentials: { client_email, private_key },
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
}

function drive() {
  return google.drive({ version: "v3", auth: getAuth() });
}

export async function createClientFolder(clientName: string): Promise<{ id: string; url: string }> {
  const d = drive();
  const res = await d.files.create({
    requestBody: {
      name: `${clientName} — Coaching Client`,
      mimeType: "application/vnd.google-apps.folder",
      parents: [process.env.GOOGLE_DRIVE_CLIENTS_ROOT_FOLDER_ID!],
    },
    fields: "id",
  });
  const id = res.data.id!;
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
  const d = drive();
  const res = await d.files.list({
    q: `'${process.env.GOOGLE_DRIVE_TEMPLATE_FOLDER_ID}' in parents and trashed = false`,
    fields: "files(id,name)",
  });
  return (res.data.files ?? []).filter(
    (f): f is { id: string; name: string } => typeof f.id === "string" && typeof f.name === "string"
  );
}

export type ClientDocs = {
  folderUrl: string;
  folderId: string;
  docs: Record<string, string>;
};

export async function setupClientFolder(clientName: string): Promise<ClientDocs> {
  const { id: folderId, url: folderUrl } = await createClientFolder(clientName);
  const templates = await listTemplates();
  const docs: Record<string, string> = {};
  await Promise.all(
    templates.map(async (t) => {
      const newId = await copyTemplate(t.id, folderId, `${clientName} — ${t.name}`);
      docs[t.name] = newId;
    })
  );
  return { folderId, folderUrl, docs };
}
