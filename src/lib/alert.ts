export async function sendErrorAlert(
  context: string,
  error: unknown,
  metadata?: Record<string, string>
): Promise<void> {
  const webhookUrl = process.env.DISCORD_ERROR_WEBHOOK_URL;
  if (!webhookUrl) return; // silently skip if not configured

  const message = error instanceof Error ? error.message : String(error);
  const fields = metadata
    ? Object.entries(metadata).map(([name, value]) => ({ name, value, inline: true }))
    : [];

  const body = {
    embeds: [{
      title: `🚨 Error: ${context}`,
      description: `\`\`\`${message}\`\`\``,
      color: 0xff0000,
      fields,
      timestamp: new Date().toISOString(),
    }],
  };

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Never throw from alert — don't make error handling cause more errors
  }
}

/**
 * Mark an async operation as completed. Called by Make.com scenarios
 * via POST /api/kv/confirm to confirm they successfully processed a job.
 */
export async function markConfirmed(
  key: string,
  value: Record<string, unknown> = {}
): Promise<void> {
  const { kv } = await import("@vercel/kv");
  await kv.set(key, {
    ...value,
    confirmedAt: new Date().toISOString(),
  }, { ex: 60 * 60 * 24 * 7 }); // 7 day TTL
}

/**
 * Check if an async operation was confirmed within the given window.
 * Returns the confirmation record or null if not confirmed / expired.
 */
export async function getConfirmation(key: string): Promise<Record<string, unknown> | null> {
  const { kv } = await import("@vercel/kv");
  return kv.get<Record<string, unknown>>(key);
}

/**
 * Get all pending Drive failures (keys matching sns:drive:failed:*)
 */
export async function getDriveFailures(): Promise<Array<{ email: string; data: unknown }>> {
  const { kv } = await import("@vercel/kv");
  try {
    const keys = await kv.keys("sns:drive:failed:*");
    if (!keys.length) return [];
    const values = await Promise.all(keys.map(k => kv.get(k)));
    return keys.map((key, i) => ({
      email: key.replace("sns:drive:failed:", ""),
      data: values[i],
    }));
  } catch {
    return [];
  }
}
