import { kv } from "@vercel/kv";
import { updatePipelineFromReplogs, bumpPipelineVersion } from "@/lib/sheets-sync";
import { verifySecret } from "@/lib/webhook-auth";
import type { StaffMeta } from "@/lib/staff-registry";
import type { DailyEntry } from "@/app/api/replog/route";

export async function POST(req: Request) {
  const secret = req.headers.get("x-sheets-secret");
  if (!verifySecret(secret, process.env.SHEETS_WEBHOOK_SECRET)) {
    return new Response("Forbidden", { status: 403 });
  }

  let body: { staffName: string; entry: DailyEntry };
  try {
    body = await req.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const { staffName, entry } = body;
  if (!staffName || !entry?.date) {
    return new Response("Bad Request", { status: 400 });
  }

  const staff  = (await kv.get<StaffMeta[]>("sns-staff-registry")) ?? [];
  const first  = staffName.trim().toLowerCase().split(" ")[0];
  const member = staff.find(s => s.name.trim().toLowerCase().startsWith(first));

  if (member) {
    const kvKey  = `sns-replog-${member.id}`;
    const existing = (await kv.get<DailyEntry[]>(kvKey)) ?? [];
    const updated  = existing.some(e => e.date === entry.date)
      ? existing.map(e => e.date === entry.date ? entry : e)
      : [entry, ...existing].sort((a, b) => b.date.localeCompare(a.date));
    await kv.set(kvKey, updated);
  }

  // Rebuild team aggregate regardless — even unknown staff names may affect totals
  updatePipelineFromReplogs().catch(() => {});
  await bumpPipelineVersion();

  return Response.json({ ok: true });
}
