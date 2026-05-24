/**
 * share-sheets-to-sa.mjs
 *
 * Usage (two-step):
 *   Step 1 — get auth URL:    node scripts/share-sheets-to-sa.mjs
 *   Step 2 — use the code:    node scripts/share-sheets-to-sa.mjs <CODE>
 */

import { google } from "googleapis";
import { exec }   from "child_process";

// Set these before running:
//   $env:OAUTH_CLIENT_ID     = "...your client id..."
//   $env:OAUTH_CLIENT_SECRET = "...your client secret..."
const CLIENT_ID     = process.env.OAUTH_CLIENT_ID     ?? "";
const CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET ?? "";
const REDIRECT_URI  = "urn:ietf:wg:oauth:2.0:oob";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Set OAUTH_CLIENT_ID and OAUTH_CLIENT_SECRET env vars before running.");
  process.exit(1);
}

const TARGET = "snsapp@sns-clients-494517.iam.gserviceaccount.com";
const SHEETS = [
  { id: "16U8r2DftWYKO6rfN9NKns42JqShj-HVqckd-Zhg5vfk", name: "Kian"   },
  { id: "1FNk4rFjuFq4uU_NLWfhLs-PmNyFMiIn9vw_G5_zgNmc", name: "Elias"  },
  { id: "11WVAec9S8flwbHc-yDLbVv3T2R1_9tENJRIJyWR5eaU", name: "Naomi"  },
  { id: "1Oo8vHNbhU2qbNdGCtvVOI-6wlmLLm_R7V216BtwCEI0", name: "Callum" },
  { id: "1Mvdz5FI1e9Teb_xImruqXMg-5-nG90D_fJDG-qfj2t8", name: "Taha"   },
];

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const code = process.argv[2];

if (!code) {
  // ── Step 1: print the auth URL ──────────────────────────────────────────────
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/drive"],
    prompt: "consent",
  });

  console.log("\n🔐 Open this URL in your browser (sign in as evan@stacknscale.co):\n");
  console.log(authUrl);
  console.log("\nAfter clicking Allow, Google will show you a code.");
  console.log('Run: node scripts/share-sheets-to-sa.mjs <PASTE_CODE_HERE>\n');

  // try to open browser
  const cmd = process.platform === "win32" ? `start "" "${authUrl}"` : `open "${authUrl}"`;
  exec(cmd, () => {});
  process.exit(0);
}

// ── Step 2: exchange code → token → share sheets ─────────────────────────────
console.log("\nExchanging code...");
const { tokens } = await oauth2Client.getToken(code);
oauth2Client.setCredentials(tokens);
console.log("✅ Authorized!\n");

const drive = google.drive({ version: "v3", auth: oauth2Client });

for (const sheet of SHEETS) {
  try {
    await drive.permissions.create({
      fileId: sheet.id,
      requestBody: { type: "user", role: "writer", emailAddress: TARGET },
      sendNotificationEmail: false,
      fields: "id",
    });
    console.log(`✓ ${sheet.name} — shared`);
  } catch (err) {
    const msg = err?.response?.data?.error?.message ?? err.message;
    if (msg.includes("already has") || msg.includes("duplicate")) {
      console.log(`⚡ ${sheet.name} — already shared`);
    } else {
      console.error(`✗ ${sheet.name} — ${msg}`);
    }
  }
}
console.log("\n✅ Done.");
