import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import type { WeeklyPayout, Deal } from "@/lib/deal-types";
import { getWeekId, getWeekBounds } from "@/lib/payout-calc";
import { getStaffDiscordId } from "@/lib/staff-registry";
import { sendDiscordDM } from "@/lib/discord";
import { logAudit } from "@/lib/audit";

const EVAN_ID   = process.env.EVAN_DISCORD_USER_ID!;

function fmt$(n: number) {
  return `$${(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function pct(part: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}


export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: { weekId?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const weekId  = body.weekId ?? getWeekId();
  const bounds  = getWeekBounds(weekId);
  const weekKey = `sns:payouts:weekly:${weekId}`;
  const week    = await kv.get<WeeklyPayout>(weekKey);
  if (!week) return Response.json({ error: "Week not found" }, { status: 404 });

  const approvedAt = new Date().toISOString();
  await kv.set(weekKey, { ...week, status: "approved", approvedAt });

  // Audit log — fire and forget, never blocks the response
  logAudit(
    session?.user?.clientId ?? "system",
    (session?.user as any)?.name ?? "system",
    "payout.approved",
    weekId,
    "payout",
    { after: { payoutStatus: "approved", weekId } }
  ).catch(() => {});

  // Fetch deals
  const deals = (
    await Promise.all(week.dealIds.map(id => kv.get<Deal>(`sns:deals:${id}`)))
  ).filter((d): d is Deal => d !== null);

  if (!deals.length) {
    return Response.json({ ok: true, weekId, status: "approved", notified: 0 });
  }

  const gross        = deals.reduce((s, d) => s + d.grossAmount, 0);
  const net          = deals.reduce((s, d) => s + d.netAmount, 0);
  const totalPayouts = deals.reduce((s, d) => s + d.payouts.totalPayouts, 0);
  const evanNet      = net - totalPayouts;

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

  // DM each rep their cut
  await Promise.allSettled(
    repPayouts.map(async (rep) => {
      const discordId =
        (await getStaffDiscordId(rep.key))
        ?? process.env[`DISCORD_REP_ID_${rep.key.toUpperCase()}`]
        ?? null;
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

      await sendDiscordDM(discordId, message);
    })
  );

  // Resolve owner IDs
  const evanDiscordId =
    (await getStaffDiscordId("evan"))
    ?? process.env.EVAN_DISCORD_USER_ID
    ?? EVAN_ID;
  const caelumDiscordId =
    (await getStaffDiscordId("caelum"))
    ?? process.env.DISCORD_CAELUM_USER_ID
    ?? null;

  // Build per-rep summary lines for the owner DM
  const repSummaryLines = repPayouts.map(rep => {
    const repDealCount = deals.filter(d =>
      d.dmSetter?.toLowerCase().startsWith(rep.key) ||
      d.setter?.toLowerCase().startsWith(rep.key) ||
      d.closer?.toLowerCase().startsWith(rep.key)
    ).length;
    return `• ${rep.name} — **${fmt$(rep.amount)}** (${rep.role}) [${repDealCount} deal${repDealCount !== 1 ? "s" : ""}]`;
  });

  const ownerSummary = [
    `✅ **Payouts approved — week of ${bounds.start}**`,
    ``,
    `**💰 Summary**`,
    `Gross Collected: ${fmt$(gross)}`,
    `Total Going Out: ${fmt$(totalPayouts)} (${pct(totalPayouts, gross)} of gross)`,
    `Evan Take Home: **${fmt$(evanNet)}** (${pct(evanNet, gross)} of gross)`,
    ``,
    `**📋 Rep Cuts**`,
    ...repSummaryLines,
    ``,
    `📬 ${repPayouts.length} rep${repPayouts.length !== 1 ? "s" : ""} have been DM'd their cuts.`,
  ].join("\n");

  // Send owner summary to both Evan and Caelum
  await Promise.allSettled(
    [evanDiscordId, caelumDiscordId]
      .filter((id): id is string => Boolean(id))
      .map(id => sendDiscordDM(id, ownerSummary))
  );

  return Response.json({ ok: true, weekId, status: "approved", notified: repPayouts.length });
}
