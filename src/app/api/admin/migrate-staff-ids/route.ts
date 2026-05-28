import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { type StaffMeta, STAFF_KV_KEY } from "@/lib/staff-registry";

// Maps staff name slugs to env var names holding their Discord IDs
const STAFF_DISCORD_ENV_MAP: Record<string, string> = {
  caelum: "DISCORD_REP_ID_CAELUM",
  callum: "DISCORD_REP_ID_CALLUM",
  elias:  "DISCORD_REP_ID_ELIAS",
  kian:   "DISCORD_REP_ID_KIAN",
  taha:   "DISCORD_REP_ID_TAHA",
  evan:   "EVAN_DISCORD_USER_ID",
};

export async function POST(_req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const registry = await kv.get<StaffMeta[]>(STAFF_KV_KEY) ?? [];
  let updated = 0;
  let skipped = 0;

  const updatedRegistry = registry.map(staff => {
    // Skip if already has discordId
    if (staff.discordId) { skipped++; return staff; }

    const envKey   = STAFF_DISCORD_ENV_MAP[staff.id];
    const discordId = envKey ? process.env[envKey] : undefined;

    if (discordId) {
      updated++;
      return { ...staff, discordId };
    }
    return staff;
  });

  await kv.set(STAFF_KV_KEY, updatedRegistry);

  return NextResponse.json({
    ok: true,
    updated,
    skipped,
    total: registry.length,
    result: updatedRegistry.map(s => ({
      id:        s.id,
      name:      s.name,
      discordId: s.discordId ?? "NOT SET",
    })),
  });
}
