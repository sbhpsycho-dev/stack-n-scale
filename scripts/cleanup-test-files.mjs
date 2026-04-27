import { google } from "googleapis";

const ROOT_FOLDER = "1VCraA8fUGeMbT_LnnkA_60CqU9b9WVJs";
const SA_EMAIL    = "stack-n-scale-drive@sns-clients-494517.iam.gserviceaccount.com";
const SA_KEY      = process.env.GOOGLE_SA_PRIVATE_KEY?.replace(/\\n/g, "\n");

const auth = new google.auth.GoogleAuth({
  credentials: { client_email: SA_EMAIL, private_key: SA_KEY },
  scopes: ["https://www.googleapis.com/auth/drive"],
});
const drive = google.drive({ version: "v3", auth });

// List all files/folders owned by the service account
const res = await drive.files.list({
  q: `'me' in owners`,
  fields: "files(id, name, mimeType)",
  pageSize: 100,
});

const files = res.data.files ?? [];
console.log(`Found ${files.length} files owned by service account`);

for (const file of files) {
  console.log(`Deleting: ${file.name} (${file.id})`);
  await drive.files.delete({ fileId: file.id }).catch(e => console.log(`  skip: ${e.message}`));
}

console.log("✓ Cleanup complete");
