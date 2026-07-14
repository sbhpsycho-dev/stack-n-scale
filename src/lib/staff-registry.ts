import { kv } from "@vercel/kv";

export type StaffMeta = {
  id: string;           // lowercase-slugified name
  name: string;
  email?: string;
  password: string;     // hashed via hashPassword()
  createdAt: string;
  sheetId?: string;     // personal Google Sheet ID
  discordId?: string;   // Discord user ID (e.g. "203848577349648384")
  role?: "dm_setter" | "setter" | "closer" | "coach" | "admin" | "owner" | "sales_exec" | "executive" | "va";
};

export const STAFF_KV_KEY = "sns-staff-registry";

/**
 * Resolve a staff member's Discord ID from either a Discord ID string directly,
 * or a first-name string. Falls back to null if not found in the registry.
 */
export async function getStaffDiscordId(nameOrId: string): Promise<string | null> {
  const registry = await kv.get<StaffMeta[]>(STAFF_KV_KEY) ?? [];

  // First try: match by discordId directly (if nameOrId is already a Discord ID)
  const byId = registry.find(s => s.discordId === nameOrId);
  if (byId?.discordId) return byId.discordId;

  // Second try: match by name (case-insensitive first-name match)
  const firstName = nameOrId.trim().toLowerCase().split(" ")[0];
  const byName = registry.find(s => s.name.toLowerCase().split(" ")[0] === firstName);
  return byName?.discordId ?? null;
}
