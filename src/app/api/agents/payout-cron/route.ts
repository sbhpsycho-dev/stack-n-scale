import { kv } from "@vercel/kv";
import type { WeeklyPayout, Deal } from "@/lib/deal-types";
import { getWeekId, getWeekBounds } from "@/lib/payout-calc";

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN!;
const EVAN_ID   = process.env.EVAN_DISCORD_USER_ID!;

const REP_IDS: Record<string, string> = {
  caelum: "747511465443065876",
  kian:   "1485467469014634547",
  elias:  "392810193194582017",
  kolen:  "1306377540746739743",
};

function isPayoutWeek(): boolean {
  const now  = new Date();
  const date = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day  = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum   = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return weekNum % 2 === 0;
}

function fmt$(n: number) {
  return `$${(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function pct(part: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

async function openDM(userId: string): Promise<string | null> {
  const res = await fetch("https://discord.com/api/v10/users/@me/channels", {
    method: "POST",
    headers: { Authorization: `Bot ${BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipient_id: userId }),
  });
  if (!res.ok) return null;
  return (await res.json()).id ?? null;
}

async function sendDM(userId: string, content: string) {
  const channelId = await openDM(userId);
  if (!channelId) return;
  await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
}

export async function GET(req: Request) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!isPayoutWeek()) {
    return Response.json({ skipped: true, reason: "odd week" });
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

  // Mark approved
  await kv.set(weekKey, { ...week, status: "approved", approvedAt: new Date().toISOString() });

  // Fetch deals
  const deals = (
    await Promise.all(week.dealIds.map(id => kv.get<Deal>(`sns:deals:${id}`)))
  ).filter((d): d is Deal => d !== null);

  const gross        = deals.reduce((s, d) => s + d.grossAmount, 0);
  const fees         = deals.reduce((s, d) => s + d.processorFee, 0);
  const net          = deals.reduce((s, d) => s + d.netAmount, 0);

  // Build rep totals
  const totals: Record<string, { amount: number; role: string }> = {};
  totals["caelum"] = { amount: deals.reduce((s, d) => s + d.payouts.caelum, 0), role: "15% net" };

  for (const deal of deals) {
    const hasTwoParts = !!(deal.dmSetter && deal.setter);
    if (deal.dmSetter) {
      const key      = deal.dmSetter.trim().toLowerCase().split(" ")[0];
      const pctLabel = hasTwoParts ? "10% gross — DM setter" : "20% gross — DM setter";
      totals[key]    = { amount: (totals[key]?.amount ?? 0) + deal.payouts.dmSetter, role: pctLabel };
    }
    if (deal.setter) {
      const key      = deal.setter.trim().toLowerCase().split(" ")[0];
      const pctLabel = hasTwoParts ? "10% gross — setter" : "20% gross — setter";
      totals[key]    = { amount: (totals[key]?.amount ?? 0) + deal.payouts.setter, role: pctLabel };
    }
    if (deal.closer) {
      const key = deal.closer.trim().toLowerCase().split(" ")[0];
      totals[key] = { amount: (totals[key]?.amount ?? 0) + deal.payouts.closer, role: "10% gross — closer" };
    }
  }

  const repPayouts = Object.entries(totals)
    .filter(([, v]) => v.amount > 0)
    .map(([key, v]) => ({
      name: key.charAt(0).toUpperCase() + key.slice(1),
      key,
      amount: v.amount,
      role: v.role,
    }))
    .sort((a, b) => b.amount - a.amount);

  const totalPayouts = repPayouts.reduce((s, r) => s + r.amount, 0);
  const evanNet      = net - totalPayouts;

  // DM Evan — full breakdown
  await sendDM(EVAN_ID, [
    `✅ **Payouts approved — week of ${bounds.start}**`,
    ``,
    `**💰 Summary**`,
    `Gross Collected: ${fmt$(gross)}`,
    `Processor Fees: -${fmt$(fees)}`,
    `Total Going Out: ${fmt$(totalPayouts)} (${pct(totalPayouts, gross)} of gross)`,
    `Evan Take Home: **${fmt$(evanNet)}** (${pct(evanNet, gross)} of gross)`,
    ``,
    `**📋 Payouts**`,
    ...repPayouts.map(r => `${r.name} — **${fmt$(r.amount)}** (${r.role})`),
    ``,
    `📦 ${deals.length} deal${deals.length !== 1 ? "s" : ""} | 📬 Everyone has been DMd their cut.`,
  ].join("\n"));

  // DM each rep
  await Promise.allSettled(
    repPayouts.map(async (rep) => {
      const discordId = REP_IDS[rep.key];
      if (!discordId) return;

      let message: string;

      if (rep.key === "caelum") {
        message = [
          `💸 **Payout approved — week of ${bounds.start}**`,
          ``,
          `**Week totals**`,
          `Deals closed: ${deals.length}`,
          `Gross collected: ${fmt$(gross)}`,
          ``,
          `Your cut: **${fmt$(rep.amount)}** (${rep.role})`,
          ``,
          `— Stack N Scale`,
        ].join("\n");
      } else {
        const repDeals = deals.filter(d =>
          d.dmSetter?.toLowerCase().startsWith(rep.key) ||
          d.setter?.toLowerCase().startsWith(rep.key) ||
          d.closer?.toLowerCase().startsWith(rep.key)
        );

        const dealLines = repDeals.map(d => {
          let cut = 0;
          if (d.dmSetter?.toLowerCase().startsWith(rep.key)) cut += d.payouts.dmSetter;
          if (d.setter?.toLowerCase().startsWith(rep.key))   cut += d.payouts.setter;
          if (d.closer?.toLowerCase().startsWith(rep.key))   cut += d.payouts.closer;
          return `• ${d.clientName} — **${fmt$(cut)}**`;
        });

        message = [
          `💸 **Payout approved — week of ${bounds.start}**`,
          ``,
          `Your cut: **${fmt$(rep.amount)}** (${rep.role})`,
          ``,
          `**Your deals (${repDeals.length}):**`,
          ...dealLines,
          ``,
          `— Stack N Scale`,
        ].join("\n");
      }

      await sendDM(discordId, message);
    })
  );

  return Response.json({ ok: true, week: weekId, reps: repPayouts.length });
}
