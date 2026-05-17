import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { type StaffMeta, STAFF_KV_KEY } from "@/lib/staff-registry";

// Known setter sheet IDs — keyed by first name (lowercase)
const SETTER_SHEET_IDS: Record<string, string> = {
  kian:  "16U8r2DftWYKO6rfN9NKns42JqShj-HVqckd-Zhg5vfk",
  elias: "1FNk4rFjuFq4uU_NLWfhLs-PmNyFMiIn9vw_G5_zgNmc",
  naomi: "11WVAec9S8flwbHc-yDLbVv3T2R1_9tENJRIJyWR5eaU",
};

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  const existing = (await kv.get<StaffMeta[]>(STAFF_KV_KEY)) ?? [];
  const updates: string[] = [];

  for (const member of existing) {
    const firstName = member.name.trim().toLowerCase().split(/\s+/)[0];
    const sheetId = SETTER_SHEET_IDS[firstName];
    if (sheetId && member.sheetId !== sheetId) {
      member.sheetId = sheetId;
      updates.push(`${member.name} → ${sheetId}`);
    }
  }

  if (updates.length) {
    await kv.set(STAFF_KV_KEY, existing);
  }

  return Response.json({ ok: true, updated: updates, total: existing.length });
}
