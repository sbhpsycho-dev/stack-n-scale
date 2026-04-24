type EmailType = "welcome" | "rejection" | "approval";

export async function triggerEmail(
  type: EmailType,
  to: string,
  name: string,
  extras?: { reason?: string }
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
