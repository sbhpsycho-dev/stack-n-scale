export type ClientIntegrations = {
  meta?: { accessToken: string; adAccountId: string }
  ghl?: { apiKey: string; locationId: string }
  stripe?: { secretKey: string }
  sheets?: { sheetUrl: string }
  lastSyncedAt?: string
}

export const integrationsKey = (clientId: string) => `sns-integrations-${clientId}`

export async function getIntegrations(clientId: string): Promise<ClientIntegrations> {
  try {
    const { kv } = await import("@vercel/kv")
    return (await kv.get<ClientIntegrations>(integrationsKey(clientId))) ?? {}
  } catch {
    return {}
  }
}

export async function saveIntegrations(clientId: string, data: ClientIntegrations): Promise<void> {
  try {
    const { kv } = await import("@vercel/kv")
    await kv.set(integrationsKey(clientId), data)
  } catch {
    // silently fail — localStorage is the fallback
  }
}
