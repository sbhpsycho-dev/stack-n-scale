import { kv } from "@vercel/kv";
import type { Deal } from "@/lib/deal-types";
import { calculatePayouts } from "@/lib/payout-calc";
import { sendDiscordDM } from "@/lib/discord";

const TOLERANCE = 1;

function diff(stored: number, expected: number): number {
  return Math.abs(stored - expected);
}

function fmt$(n: number) {
  return `$${(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const dealIds = (await kv.get<string[]>("sns:deals:index")) ?? [];
  const deals   = (
    await Promise.all(dealIds.map(id => kv.get<Deal>(`sns:deals:${id}`)))
  ).filter((d): d is Deal => d !== null);

  type Flag = { field: string; stored: number; expected: number };
  const flagged: { deal: Deal; flags: Flag[] }[] = [];

  for (const deal of deals) {
    const flags: Flag[] = [];

    // Net amount integrity check
    const expectedNet = deal.grossAmount - deal.processorFee;
    if (diff(deal.netAmount, expectedNet) > TOLERANCE) {
      flags.push({ field: "netAmount", stored: deal.netAmount, expected: expectedNet });
    }

    // Recalculate all payout fields
    const expected = calculatePayouts(deal);
    const fields: (keyof typeof expected)[] = [
      "caelum", "mediaBuyer", "dmSetter", "setter", "closer",
      "totalPayouts", "companyReinvestment", "evanTakeHome",
    ];

    for (const field of fields) {
      if (diff(deal.payouts[field], expected[field]) > TOLERANCE) {
        flags.push({ field, stored: deal.payouts[field], expected: expected[field] });
      }
    }

    if (flags.length) flagged.push({ deal, flags });
  }

  if (flagged.length === 0) {
    return Response.json({ ok: true, checked: deals.length, flagged: 0 });
  }

  const lines = [
    `⚠️ **Payout Math Mismatch — ${flagged.length} deal${flagged.length !== 1 ? "s" : ""} flagged**`,
    "",
  ];

  for (const { deal, flags } of flagged) {
    lines.push(`**${deal.clientName}** (${deal.date})`);
    for (const f of flags) {
      const delta = f.stored - f.expected;
      lines.push(`  ${f.field}: stored ${fmt$(f.stored)} → expected ${fmt$(f.expected)} (Δ ${delta >= 0 ? "+" : ""}${fmt$(delta)})`);
    }
    lines.push("");
  }

  lines.push("Go to /staff/deals to review and recalculate.");

  const msg = lines.join("\n");
  const adminIds = [
    process.env.DISCORD_CAELUM_USER_ID,
    process.env.EVAN_DISCORD_USER_ID,
  ].filter(Boolean) as string[];

  await Promise.all(adminIds.map(id => sendDiscordDM(id, msg).catch(e => console.error(`Discord DM error (${id}):`, e))));

  return Response.json({ ok: true, checked: deals.length, flagged: flagged.length });
}
