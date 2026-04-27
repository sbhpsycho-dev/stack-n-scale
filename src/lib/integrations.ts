export type ClientIntegrations = {
  meta?: { accessToken: string; adAccountId: string }
  ghl?: { apiKey: string; locationId: string }
  stripe?: { secretKey: string }
  sheets?: { sheetUrl: string }
  lastSyncedAt?: string
}

export const integrationsKey = (clientId: string) => `sns-integrations-${clientId}`

function maskSecret(val: string | undefined): string {
  if (!val) return "";
  if (val.length <= 8) return "••••••••";
  return val.slice(0, 4) + "••••••••" + val.slice(-4);
}

export async function getIntegrations(clientId: string): Promise<ClientIntegrations> {
  try {
    const { kv } = await import("@vercel/kv")
    return (await kv.get<ClientIntegrations>(integrationsKey(clientId))) ?? {}
  } catch {
    return {}
  }
}

// Returns the same shape but with secrets masked — safe to send to the browser
export async function getIntegrationsMasked(clientId: string): Promise<ClientIntegrations> {
  const raw = await getIntegrations(clientId);
  return {
    ...raw,
    meta:   raw.meta   ? { accessToken: maskSecret(raw.meta.accessToken), adAccountId: raw.meta.adAccountId } : undefined,
    ghl:    raw.ghl    ? { apiKey: maskSecret(raw.ghl.apiKey), locationId: raw.ghl.locationId } : undefined,
    stripe: raw.stripe ? { secretKey: maskSecret(raw.stripe.secretKey) } : undefined,
  };
}

export async function saveIntegrations(clientId: string, data: ClientIntegrations): Promise<void> {
  try {
    const { kv } = await import("@vercel/kv")
    await kv.set(integrationsKey(clientId), data)
  } catch {
    // silently fail — localStorage is the fallback
  }
}
