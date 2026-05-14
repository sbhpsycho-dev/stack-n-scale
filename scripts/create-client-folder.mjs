import { config } from "dotenv";
import { createInterface } from "readline";

config({ path: ".env.local" });

const email = process.argv[2];
if (!email) { console.error("Usage: node scripts/create-client-folder.mjs <email>"); process.exit(1); }

// ── Google Drive ──────────────────────────────────────────────────────────────
import { google } from "googleapis";

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SA_EMAIL,
    private_key: process.env.GOOGLE_SA_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  },
  scopes: ["https://www.googleapis.com/auth/drive"],
});
const drive = google.drive({ version: "v3", auth });

async function createFolder(name, parentId) {
  const res = await drive.files.create({
    requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
    fields: "id",
  });
  return res.data.id;
}

// ── KV ───────────────────────────────────────────────────────────────────────
const KV_URL   = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

async function kvGet(key) {
  const r = await fetch(`${KV_URL}/get/${key}`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } });
  const j = await r.json();
  return j.result ? JSON.parse(j.result) : null;
}

async function kvSet(key, value) {
  await fetch(`${KV_URL}/set/${key}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KV_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(JSON.stringify(value)),
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────
const clientKey = `sns:coaching:client:${email.toLowerCase().trim()}`;
const client = await kvGet(clientKey);

if (!client) { console.error("No client found for", email); process.exit(1); }
if (client.driveFolder) { console.log("Folder already exists:", client.driveFolder); process.exit(0); }

console.log("Creating Drive folders for", client.name, "...");
const root = process.env.GOOGLE_DRIVE_CLIENTS_ROOT_FOLDER_ID;
const rootId   = await createFolder(`client - ${client.name}`, root);
const [idId, onboardId, notesId] = await Promise.all([
  createFolder("ID Verification", rootId),
  createFolder("Onboarding", rootId),
  createFolder("Notes", rootId),
]);

const driveFolder = {
  url: `https://drive.google.com/drive/folders/${rootId}`,
  id: rootId,
  idVerificationFolderId: idId,
  onboardingFolderId: onboardId,
  notesFolderId: notesId,
  docs: {},
};

await kvSet(clientKey, { ...client, driveFolder });
console.log("Done!", driveFolder);
