/**
 * /api/cron/lead-pipeline-summary
 *
 * Posts the daily or weekly lead pipeline summary to #daily-summary.
 *
 * Cron schedule (vercel.json):
 *   Daily:  "0 13 * * *"   → 8 AM ET every day (UTC-5 / UTC-4; using UTC-5 base)
 *   Weekly: "0 13 * * 1"   → 8 AM ET every Monday (same endpoint, ?weekly=1 param)
 *
 * Daily summary covers: yesterday's leads, booked, shows, no-shows,
 * show rate, book rate, and (if spend is on file) CPL + CPBA by campaign.
 *
 * Weekly summary covers: Mon–Sun of the prior week, WoW delta vs the
 * week before that, and cost metrics if spend data exists.
 */

import { kv } from "@vercel/kv";
import { verifyCronSecret } from "@/lib/cron-auth";
import { sendWebhookEmbed, buildLeadPipelineSummaryEmbed } from "@/lib/discord";
import {
  getPipelineMetrics,
  getWeeklyMetrics,
  sumPipelineDays,
  getMetaSpend,
} from "@/lib/lead-pipeline";

export const runtime = "nodejs";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function summaryWebhookUrl(): Promise<string> {
  return (
    process.env.DISCORD_WEBHOOK_DAILY_SUMMARY ||
    (await kv.get<string>("sns:config:DISCORD_WEBHOOK_DAILY_SUMMARY")) ||
    ""
  );
}

/** Format a ratio as "X%" — returns "—" on divide-by-zero. */
function pct(numerator: number, denominator: number): string {
  if (!denominator) return "—";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

/** Format a dollar amount as "$X.XX" — returns "—" if falsy. */
function dollars(n: number | undefined): string {
  if (!n) return "—";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Find the top campaign by lead volume from a campaigns map.
 * Returns [name, count] or undefined if empty.
 */
function topCampaign(campaigns: Record<string, number>): [string, number] | undefined {
  const entries = Object.entries(campaigns);
  if (!entries.length) return undefined;
  return entries.reduce((best, cur) => (cur[1] > best[1] ? cur : best));
}

/**
 * Get the ISO date string for the Monday of the given week offset.
 * offset=0 → this week's Monday; offset=-1 → last week's Monday.
 * All dates are computed in UTC (daily buckets are ET; close enough for weekly).
 */
function getMondayOfWeek(offset: number): string {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun, 1=Mon, …
  const daysToMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + daysToMon + offset * 7);
  return monday.toISOString().slice(0, 10);
}

// ── Daily summary ─────────────────────────────────────────────────────────────

async function postDailySummary(webhookUrl: string): Promise<void> {
  // "Yesterday" in ET (approx UTC-5)
  const yesterday = new Date(Date.now() - 5 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000);
  const dateStr = yesterday.toISOString().slice(0, 10);

  const metrics = await getPipelineMetrics(dateStr);
  const spend   = await getMetaSpend(dateStr);

  const shows    = metrics.booked - metrics.noShows;
  const showRate = pct(shows < 0 ? 0 : shows, metrics.booked);
  const bookRate = pct(metrics.booked, metrics.leads);

  const cpl  = spend ? dollars(spend.total / (metrics.leads  || 1)) : undefined;
  const cpba = spend ? dollars(spend.total / (metrics.booked || 1)) : undefined;

  const top = topCampaign(metrics.campaigns);
  const dateLabel = new Date(dateStr + "T12:00:00Z").toLocaleDateString("en-US", {
    weekday: "long", month: "short", day: "numeric",
  });

  const embed = buildLeadPipelineSummaryEmbed({
    isWeekly:         false,
    dateLabel,
    leads:            metrics.leads,
    booked:           metrics.booked,
    shows:            shows < 0 ? 0 : shows,
    noShows:          metrics.noShows,
    showRate,
    bookRate,
    spend:            spend?.total,
    cpl,
    cpba,
    topCampaign:      top?.[0],
    topCampaignLeads: top?.[1],
  });

  await sendWebhookEmbed(webhookUrl, embed);

  console.log(`[cron/lead-pipeline-summary] daily posted for ${dateStr}: leads=${metrics.leads} booked=${metrics.booked}`);
}

// ── Weekly summary ────────────────────────────────────────────────────────────

async function postWeeklySummary(webhookUrl: string): Promise<void> {
  // Prior week: Monday of last week
  const lastMonday      = getMondayOfWeek(-1);
  // Two weeks ago for WoW comparison
  const prevMonday      = getMondayOfWeek(-2);

  const [thisWeekDays, prevWeekDays] = await Promise.all([
    getWeeklyMetrics(lastMonday),
    getWeeklyMetrics(prevMonday),
  ]);

  const thisWeek = sumPipelineDays(thisWeekDays);
  const prevWeek = sumPipelineDays(prevWeekDays);

  // Aggregate spend for the week
  let totalSpend = 0;
  const weekCampaignSpend: Record<string, number> = {};
  for (const day of thisWeekDays) {
    const s = await getMetaSpend(day.date);
    if (s) {
      totalSpend += s.total;
      for (const [k, v] of Object.entries(s.campaigns)) {
        weekCampaignSpend[k] = (weekCampaignSpend[k] ?? 0) + v;
      }
    }
  }

  const shows    = thisWeek.booked - thisWeek.noShows;
  const showRate = pct(shows < 0 ? 0 : shows, thisWeek.booked);
  const bookRate = pct(thisWeek.booked, thisWeek.leads);

  const cpl  = totalSpend ? dollars(totalSpend / (thisWeek.leads  || 1)) : undefined;
  const cpba = totalSpend ? dollars(totalSpend / (thisWeek.booked || 1)) : undefined;

  const top = topCampaign(thisWeek.campaigns);

  // Format date range label, e.g. "May 19 – May 25"
  const endDate = new Date(lastMonday + "T12:00:00Z");
  endDate.setUTCDate(endDate.getUTCDate() + 6);
  const startLabel = new Date(lastMonday + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endLabel   = endDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const dateLabel  = `${startLabel} – ${endLabel}`;

  const embed = buildLeadPipelineSummaryEmbed({
    isWeekly:         true,
    dateLabel,
    leads:            thisWeek.leads,
    booked:           thisWeek.booked,
    shows:            shows < 0 ? 0 : shows,
    noShows:          thisWeek.noShows,
    showRate,
    bookRate,
    spend:            totalSpend || undefined,
    cpl,
    cpba,
    topCampaign:      top?.[0],
    topCampaignLeads: top?.[1],
    prevLeads:        prevWeek.leads,
    prevBooked:       prevWeek.booked,
  });

  await sendWebhookEmbed(webhookUrl, embed);

  console.log(
    `[cron/lead-pipeline-summary] weekly posted for ${lastMonday}: leads=${thisWeek.leads} booked=${thisWeek.booked} spend=${totalSpend}`
  );
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  if (!verifyCronSecret(req.headers.get("authorization"))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const isWeekly = searchParams.get("weekly") === "1";

  const webhookUrl = await summaryWebhookUrl();
  if (!webhookUrl) {
    console.warn("[cron/lead-pipeline-summary] DISCORD_WEBHOOK_DAILY_SUMMARY not set — skipping");
    return Response.json({ ok: false, reason: "webhook not configured" });
  }

  try {
    if (isWeekly) {
      await postWeeklySummary(webhookUrl);
    } else {
      await postDailySummary(webhookUrl);
    }
    return Response.json({ ok: true, type: isWeekly ? "weekly" : "daily" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cron/lead-pipeline-summary] failed:", msg);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
