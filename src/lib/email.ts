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
  });
}
