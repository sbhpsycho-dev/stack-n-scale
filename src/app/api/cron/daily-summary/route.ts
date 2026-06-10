import { verifyCronSecret } from "@/lib/cron-auth";
import { kv } from "@vercel/kv";
import { sendChannelMessage } from "@/lib/discord";

const BOILER_ROOM_CHANNEL_ID = process.env.DISCORD_BOILER_ROOM_CHANNEL_ID ?? "1497034366335979662";

type StaffMeta = { id: string; name: string };
type DailyEntry = {
  date: string;
  callsMade: number;
  callsAnswered: number;
  demosSet: number;
  demosShowed: number;
  pitched: number;
  closed: number;
  cashCollected: number;
};

export async function GET(req: Request) {
  if (!verifyCronSecret(req.headers.get("authorization"))) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    // Cron fires at 03:00 UTC = 8 PM PDT (UTC-7). Shift to get the PDT date.
    const pdtNow = new Date(Date.now() - 7 * 60 * 60 * 1000);
    const todayStr = pdtNow.toISOString().slice(0, 10); // YYYY-MM-DD in PDT

    const staff = (await kv.get<StaffMeta[]>("sns-staff-registry")) ?? [];
    if (staff.length === 0) {
      console.log("[cron/daily-summary] no staff found, skipping");
      return Response.json({ ok: true, skipped: true });
    }

    // Gather today's entry for each staff member
    const results = await Promise.all(
      staff.map(async (s) => {
        const entries = (await kv.get<DailyEntry[]>(`sns-replog-${s.id}`)) ?? [];
        const entry = entries.find((e) => e.date === todayStr) ?? null;
        return { name: s.name, entry };
      })
    );

    const logged   = results.filter((r) => r.entry !== null);
    const noEntry  = results.filter((r) => r.entry === null);

    const totalClosed        = logged.reduce((sum, r) => sum + (r.entry?.closed ?? 0), 0);
    const totalCash          = logged.reduce((sum, r) => sum + (r.entry?.cashCollected ?? 0), 0);

    // Format date as "May 22, 2026"
    const displayDate = pdtNow.toLocaleDateString("en-US", {
      month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
    });

    const lines: string[] = [`📋 **Daily Wrap-Up — ${displayDate}**\n`];

    for (const { name, entry } of logged) {
      const e = entry!;
      lines.push(
        `**${name}** — ${e.callsMade} calls / ${e.callsAnswered} ans ` +
        `・ ${e.demosSet} set / ${e.demosShowed} showed ` +
        `・ ${e.closed} closed ・ 💰 $${e.cashCollected.toLocaleString()}`
      );
    }

    for (const { name } of noEntry) {
      lines.push(`**${name}** — ❌ no entry`);
    }

    lines.push(
      `\n✅ ${logged.length}/${staff.length} reps logged ` +
      `・ ${totalClosed} closed ・ 💰 $${totalCash.toLocaleString()} total`
    );

    await sendChannelMessage(BOILER_ROOM_CHANNEL_ID, lines.join("\n"));

    console.log(`[cron/daily-summary] posted for ${todayStr}: ${logged.length}/${staff.length} reps logged`);
    return Response.json({ ok: true, date: todayStr, logged: logged.length, total: staff.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cron/daily-summary] failed:", msg);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
