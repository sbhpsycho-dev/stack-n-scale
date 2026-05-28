import { kv } from "@vercel/kv";
import type { WeeklyPayout, Deal } from "@/lib/deal-types";
import { getWeekId, getWeekBounds } from "@/lib/payout-calc";
import { sendDiscordDM } from "@/lib/discord";
import { verifyCronSecret } from "@/lib/cron-auth";
import { getStaffDiscordId } from "@/lib/staff-registry";
import { triggerScenario } from "@/lib/make";

const EVAN_ID = process.env.EVAN_DISCORD_USER_ID!;

function fmt$(n: number) {
  return `$${(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function pct(part: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!verifyCronSecret(authHeader)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const weekId  = getWeekId();
  const bounds  = getWeekBounds(weekId);
  const weekKey = `sns:payouts:weekly:${weekId}`;
  const week    = await kv.get<WeeklyPayout>(weekKey);

  if (!week?.dealIds?.length) {
    return Response.json({ skipped: true, reason: "no deals" });
  }
  if (week.status === "approved" || week.status === "paid") {
    return Response.json({ skipped: true, reason: `already ${week.status}` });
  }

  // Fetch deals for the summary
  const deals = (
    await Promise.all(week.dealIds.map(id => kv.get<Deal>(`sns:deals:${id}`)))
  ).filter((d): d is Deal => d !== null);

  const gross               = deals.reduce((s, d) => s + d.grossAmount, 0);
  const fees                = deals.reduce((s, d) => s + d.processorFee, 0);
  const net                 = deals.reduce((s, d) => s + d.netAmount, 0);
  const totalPayouts        = deals.reduce((s, d) => s + d.payouts.totalPayouts, 0);
  const companyReinvestment = deals.reduce((s, d) => s + d.payouts.companyReinvestment, 0);
  const evanNet             = deals.reduce((s, d) => s + d.payouts.evanTakeHome, 0);

  // Build per-rep preview for Evan's review message
  type RepEntry = { amount: number; role: string; deals: { client: string; gross: number; cut: number; ad: boolean }[] };
  const repTotals: Record<string, RepEntry> = {};
  repTotals["caelum"] = { amount: deals.reduce((s, d) => s + d.payouts.caelum, 0), role: "15% net", deals: [] };

  for (const deal of deals) {
    if (deal.dmSetter) {
      const key = deal.dmSetter.trim().toLowerCase().split(" ")[0];
      if (!repTotals[key]) repTotals[key] = { amount: 0, role: "10% gross — DM setter", deals: [] };
      repTotals[key].amount += deal.payouts.dmSetter;
      repTotals[key].deals.push({ client: deal.clientName, gross: deal.grossAmount, cut: deal.payouts.dmSetter, ad: deal.leadSource === "ad" });
    }
    if (deal.setter) {
      const key      = deal.setter.trim().toLowerCase().split(" ")[0];
      const pctLabel = "10% gross — setter";
      if (!repTotals[key]) repTotals[key] = { amount: 0, role: pctLabel, deals: [] };
      repTotals[key].amount += deal.payouts.setter;
      repTotals[key].deals.push({ client: deal.clientName, gross: deal.grossAmount, cut: deal.payouts.setter, ad: deal.leadSource === "ad" });
    }
    if (deal.closer) {
      const key = deal.closer.trim().toLowerCase().split(" ")[0];
      if (!repTotals[key]) repTotals[key] = { amount: 0, role: "10% gross — closer", deals: [] };
      repTotals[key].amount += deal.payouts.closer;
      repTotals[key].deals.push({ client: deal.clientName, gross: deal.grossAmount, cut: deal.payouts.closer, ad: deal.leadSource === "ad" });
    }
  }

  const repLines = Object.entries(repTotals)
    .filter(([, v]) => v.amount > 0)
    .sort(([, a], [, b]) => b.amount - a.amount)
    .map(([key, v]) => {
      const name    = key.charAt(0).toUpperCase() + key.slice(1);
      const header  = `${name} — **${fmt$(v.amount)}** (${v.role})`;
      const bullets = v.deals.map(d =>
        `  • ${d.client} | ${fmt$(d.gross)} gross → ${fmt$(d.cut)}${d.ad ? " (ad)" : ""}`
      );
      return [header, ...bullets].join("\n");
    });

  // Resolve owner Discord IDs
  const evanDiscordId =
    (await getStaffDiscordId("evan"))
    ?? process.env.EVAN_DISCORD_USER_ID
    ?? EVAN_ID;
  const caelumDiscordId =
    (await getStaffDiscordId("caelum"))
    ?? process.env.DISCORD_CAELUM_USER_ID
    ?? null;

  const summaryLines = [
    `**💰 Summary**`,
    `Gross Collected: ${fmt$(gross)}`,
    `Processor Fees: -${fmt$(fees)}`,
    `Total Going Out (reps): ${fmt$(totalPayouts)} (${pct(totalPayouts, gross)} of gross)`,
    `Company Reinvestment (10%): ${fmt$(companyReinvestment)}`,
    `Evan Take Home: **${fmt$(evanNet)}** (${pct(evanNet, gross)} of gross)`,
    ``,
    `**📋 Rep Cuts**`,
    ...repLines,
    ``,
    `Company Reinvestment — **${fmt$(companyReinvestment)}** (10% of remainder)`,
    `Evan — **${fmt$(evanNet)}** (take home)`,
  ];

  // DM Evan — summary + approval request
  await sendDiscordDM(evanDiscordId, [
    `📋 **Payout ready for review — week of ${bounds.start}**`,
    ``,
    ...summaryLines,
    ``,
    `📦 ${deals.length} deal${deals.length !== 1 ? "s" : ""} | ✅ Go to /staff/payouts to approve and send rep notifications.`,
  ].join("\n"));

  // DM Caelum — read-only breakdown (no approval action)
  if (caelumDiscordId) {
    await sendDiscordDM(caelumDiscordId, [
      `📋 **Payout breakdown — week of ${bounds.start}**`,
      ``,
      ...summaryLines,
      ``,
      `📦 ${deals.length} deal${deals.length !== 1 ? "s" : ""} | 👀 Pending Evan's approval.`,
    ].join("\n"));
  }

  // Resolve per-rep Discord IDs for Make.com payload
  const repEntries = Object.entries(repTotals).filter(([, v]) => v.amount > 0);
  const repDiscordIds = await Promise.all(
    repEntries.map(([key]) => getStaffDiscordId(key).catch(() => null))
  );

  // Trigger Make.com payout dispatch scenario — sends full breakdown for Sheets logging + notifications
  triggerScenario("MAKE_PAYOUT_WEBHOOK_URL", {
    weekId,
    weekStart: bounds.start,
    payouts: repEntries.map(([key, v], i) => ({
      staffDiscordId: repDiscordIds[i] ?? process.env[`DISCORD_REP_ID_${key.toUpperCase()}`] ?? null,
      staffName:      key.charAt(0).toUpperCase() + key.slice(1),
      amount:         v.amount,
      deals:          v.deals,
    })),
    totalGMV:  gross,
    timestamp: new Date().toISOString(),
  }).catch(() => {});

  return Response.json({ ok: true, week: weekId, deals: deals.length });
}
