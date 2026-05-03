type EmailType = "welcome" | "rejection" | "approval" | "discord_link" | "form_received" | "id_received";

export async function triggerEmail(
  type: EmailType,
  to: string,
  name: string,
  extras?: {
    reason?: string;
    discordOAuthUrl?: string;
    driveFolderUrl?: string;
    onboardingFolderId?: string;
    idVerificationFolderId?: string;
    formData?: Record<string, string>;
    skoolLink?: string;
  }
) {
  const url = process.env.MAKE_EMAIL_WEBHOOK_URL;
  if (!url) {
    console.warn("MAKE_EMAIL_WEBHOOK_URL not set — skipping email");
    return;
  }
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, to, name, ...extras }),
    signal: AbortSignal.timeout(5000),
  });
}

export async function triggerCampaign(
  email: string,
  name: string,
  amount: number,
  source: "stripe" | "fanbasis"
) {
  const url = process.env.MAKE_CAMPAIGN_WEBHOOK_URL;
  if (!url) {
    console.warn("MAKE_CAMPAIGN_WEBHOOK_URL not set — skipping campaign trigger");
    return;
  }
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, name, amount, source }),
    signal: AbortSignal.timeout(5000),
  }).catch(e => console.error("Campaign webhook error:", e));
}

export async function triggerDriveDocs(
  type: "form_received" | "id_received",
  to: string,
  name: string,
  extras?: {
    onboardingFolderId?: string;
    idVerificationFolderId?: string;
    notesFolderId?: string;
    formData?: Record<string, string>;
    formFile?: string;
    idFrontUrl?: string;
    selfieUrl?: string;
    signatureUrl?: string;
  }
) {
  const url = process.env.MAKE_DRIVE_DOCS_WEBHOOK_URL;
  if (!url) return;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, to, name, ...extras }),
    signal: AbortSignal.timeout(5000),
  });
}
