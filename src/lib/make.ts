/**
 * Make.com webhook trigger helper.
 * Fires a webhook to a Make.com scenario and optionally waits for confirmation.
 * Never throws — failures are logged but don't break the caller.
 */

type MakeTriggerOptions = {
  /** If true, await the response (Make.com can return data). Default: fire-and-forget */
  awaitResponse?: boolean;
  /** Timeout in ms. Default: 5000 */
  timeout?: number;
};

export async function triggerScenario(
  webhookEnvKey: string,
  payload: Record<string, unknown>,
  options: MakeTriggerOptions = {}
): Promise<{ ok: boolean; data?: unknown }> {
  const webhookUrl = process.env[webhookEnvKey];
  if (!webhookUrl) {
    // Silently skip if URL not configured — Make.com is optional
    return { ok: false };
  }

  const { awaitResponse = false, timeout = 5000 } = options;

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeout),
    });

    if (!res.ok) {
      console.error(`[make] ${webhookEnvKey} returned ${res.status}`);
      return { ok: false };
    }

    if (awaitResponse) {
      const data = await res.json().catch(() => null);
      return { ok: true, data };
    }

    return { ok: true };
  } catch (err) {
    console.error(`[make] ${webhookEnvKey} failed:`, err);
    return { ok: false };
  }
}
