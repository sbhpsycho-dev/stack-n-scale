const DISCORD_API = "https://discord.com/api/v10";

// ── Embed types ───────────────────────────────────────────────────────────────

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbed {
  title: string;
  color: number;           // decimal integer (Discord uses decimal, not 0x hex)
  description?: string;
  fields?: DiscordEmbedField[];
  footer?: { text: string };
  timestamp?: string;      // ISO 8601
}

// ── Private helpers ───────────────────────────────────────────────────────────

/** Strip @everyone/@here injection and cap length. */
function sanitize(text: string, maxLen = 256): string {
  return text
    .replace(/@(?:everyone|here)/g, "@​$&")
    .replace(/[[\]()]/g, "")
    .slice(0, maxLen);
}

/** Fetch with exponential backoff. Only retries on 5xx or network errors. */
async function retryFetch(
  url: string,
  init: RequestInit,
  attempts = 3,
  delays = [500, 1000, 2000]
): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(5000),
      });
      // Don't retry 4xx — malformed payload won't fix itself
      if (res.ok || res.status < 500) return res;
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise(r => setTimeout(r, delays[i]));
    }
  }
  throw lastErr;
}

// ── Webhook sender ────────────────────────────────────────────────────────────

/**
 * Post a rich embed to a Discord webhook URL.
 * Swallows all errors after retries — callers must never crash on Discord failure.
 */
export async function sendWebhookEmbed(
  webhookUrl: string,
  embed: DiscordEmbed,
  content?: string
): Promise<void> {
  if (!webhookUrl) return;
  try {
    await retryFetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(content ? { content } : {}),
        embeds: [embed],
      }),
    });
  } catch (err) {
    console.error("[discord] sendWebhookEmbed failed after retries:", err);
  }
}

// ── Embed builders ────────────────────────────────────────────────────────────

const COLOR_NEW_LEAD    = 0x00C851; // green
const COLOR_APPOINTMENT = 0x0066FF; // blue
const COLOR_REPLY       = 0xFFB300; // amber
const COLOR_DEAL_CLOSED = 0x00C851; // green
const COLOR_META_LEAD   = 0x9C27B0; // purple

export function buildNewLeadEmbed(p: {
  name: string;
  phone?: string;
  source?: string;
  assignedRep?: string;
  stage?: string;
  campaign?: string;
}): DiscordEmbed {
  return {
    title: `🎯 New Lead — ${sanitize(p.name)}`,
    color: COLOR_NEW_LEAD,
    fields: [
      { name: "📱 Phone",          value: p.phone                        || "—", inline: true },
      { name: "🏷️ Source",        value: sanitize(p.source      || "—"),        inline: true },
      { name: "👤 Assigned Rep",   value: sanitize(p.assignedRep || "—"),        inline: true },
      { name: "📊 Pipeline Stage", value: sanitize(p.stage       || "—"),        inline: true },
      { name: "📢 Campaign",       value: sanitize(p.campaign    || "—"),        inline: true },
    ],
    footer:    { text: "SNS Notifications" },
    timestamp: new Date().toISOString(),
  };
}

export function buildAppointmentEmbed(p: {
  name: string;
  dateTime?: string;
  calendarName?: string;
  assignedRep?: string;
}): DiscordEmbed {
  const formatted = p.dateTime
    ? new Date(p.dateTime).toLocaleString("en-US", {
        weekday: "short", month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit", timeZoneName: "short",
      })
    : "—";

  return {
    title: `📅 Appointment Booked — ${sanitize(p.name)}`,
    color: COLOR_APPOINTMENT,
    fields: [
      { name: "🗓️ Date & Time",   value: formatted,                             inline: false },
      { name: "📋 Calendar",       value: sanitize(p.calendarName || "—"),        inline: true  },
      { name: "👤 Assigned Rep",   value: sanitize(p.assignedRep  || "—"),        inline: true  },
    ],
    footer:    { text: "SNS Notifications" },
    timestamp: new Date().toISOString(),
  };
}

export function buildLeadReplyEmbed(p: {
  name: string;
  message?: string;
  channel?: string;
}): DiscordEmbed {
  return {
    title: `💬 Lead Replied — ${sanitize(p.name)}`,
    color: COLOR_REPLY,
    fields: [
      { name: "📨 Channel", value: sanitize(p.channel || "SMS"),                          inline: true },
      { name: "💬 Message", value: sanitize(p.message || "—", 1024).slice(0, 1024),       inline: false },
    ],
    footer:    { text: "SNS Notifications" },
    timestamp: new Date().toISOString(),
  };
}

export function buildDealClosedEmbed(p: {
  name: string;
  amount: number;
  setter?: string;
  offer?: string;
  leadSource?: string;
}): DiscordEmbed {
  const formatted = `$${p.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  return {
    title: `🔥 Deal Closed — ${sanitize(p.name)}`,
    color: COLOR_DEAL_CLOSED,
    fields: [
      { name: "💰 Amount",      value: formatted,                          inline: true },
      { name: "📦 Offer",       value: sanitize(p.offer      || "—"),      inline: true },
      { name: "🏷️ Source",     value: sanitize(p.leadSource || "—"),      inline: true },
      { name: "👤 Setter",      value: sanitize(p.setter     || "—"),      inline: true },
    ],
    footer:    { text: "SNS Notifications" },
    timestamp: new Date().toISOString(),
  };
}

function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function buildDealClosedMessage(p: {
  name: string;
  email?: string | null;
  setter?: string | null;
  closer?: string | null;
  grossAmount: number;
  contractValue?: number | null;
}): string {
  const collected = p.grossAmount;
  const contract  = p.contractValue ?? p.grossAmount;
  const remaining = contract - collected;

  const revLine = remaining > 0
    ? `$${fmtMoney(collected)} today ($${fmtMoney(remaining)} tmr)`
    : `$${fmtMoney(collected)}`;

  return ([
    "**Deal Closed**",
    "",
    `Client name : ${sanitize(p.name)}`,
    p.email ? `Client Email : ${p.email}` : null,
    "",
    `Setter: ${sanitize(p.setter || "—")}`,
    `Closer: ${sanitize(p.closer || "—")}`,
    "",
    `Revenue: ${revLine}`,
    `Contract Value: $${fmtMoney(contract)}`,
  ] as (string | null)[]).filter((l): l is string => l !== null).join("\n");
}

export function buildMetaLeadEmbed(p: {
  name: string;
  email?: string;
  phone?: string;
  adName?: string;
  formName?: string;
}): DiscordEmbed {
  return {
    title: `📱 Meta Lead — ${sanitize(p.name)}`,
    color: COLOR_META_LEAD,
    fields: [
      { name: "📧 Email",    value: p.email                       || "—", inline: true },
      { name: "📱 Phone",    value: p.phone                       || "—", inline: true },
      { name: "📢 Ad",       value: sanitize(p.adName   || "—"),          inline: true },
      { name: "📋 Form",     value: sanitize(p.formName || "—"),          inline: true },
    ],
    footer:    { text: "SNS Notifications • Meta Lead Ads" },
    timestamp: new Date().toISOString(),
  };
}

export async function sendChannelMessage(
  channelId: string,
  content: string,
  embed?: object
): Promise<void> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token || !channelId) return;
  await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(embed ? { content, embeds: [embed] } : { content }),
    signal: AbortSignal.timeout(8000),
  });
}

/**
 * Send a critical error DM to admin users.
 * Uses DISCORD_ADMIN_USER_ID env var (comma-separated for multiple admins).
 */
export async function sendErrorDM(context: string, error: unknown): Promise<void> {
  const adminIds = (process.env.DISCORD_ADMIN_USER_ID ?? "").split(",").filter(Boolean);
  if (!adminIds.length) return;

  const message = error instanceof Error ? error.message : String(error);
  const content = `🚨 **System Error — ${context}**\n\`\`\`${message.slice(0, 1800)}\`\`\``;

  await Promise.allSettled(
    adminIds.map(id => sendDiscordDM(id, content))
  );
}

// ── Additional colors ─────────────────────────────────────────────────────────

const COLOR_ALERT    = 0xFF3B30; // red    — speed-to-lead warnings + duplicates
const COLOR_NO_SHOW  = 0xFF9500; // orange — no-shows + cancellations
const COLOR_SUMMARY  = 0x5856D6; // indigo — daily / weekly pipeline rollup

// ── Speed-to-lead alert ───────────────────────────────────────────────────────

export function buildSTLAlertEmbed(p: {
  name: string;
  phone?: string;
  minutesElapsed: number;
  contactId: string;
}): DiscordEmbed {
  const escalated = p.minutesElapsed >= 30;
  return {
    title: escalated
      ? `🚨 UNWORKED LEAD — ${sanitize(p.name)} — 30 MIN NO CONTACT`
      : `⚠️ Unworked lead — ${sanitize(p.name)} — 15 min, no contact`,
    color: COLOR_ALERT,
    description: escalated
      ? "This lead has not been contacted in **30 minutes**. Escalation — act now."
      : "This lead has not been contacted in **15 minutes**. Reach out immediately.",
    fields: [
      { name: "📱 Phone",       value: p.phone      || "—",  inline: true },
      { name: "⏱️ Elapsed",    value: `${p.minutesElapsed} min`, inline: true },
      { name: "🆔 Contact ID",  value: sanitize(p.contactId, 100), inline: true },
    ],
    footer:    { text: "SNS Speed-to-Lead" },
    timestamp: new Date().toISOString(),
  };
}

// ── Duplicate lead flag ───────────────────────────────────────────────────────

export function buildDupeLeadEmbed(p: {
  name: string;
  phone?: string;
  email?: string;
  existingContactId: string;
  newContactId: string;
}): DiscordEmbed {
  return {
    title: `🔁 Duplicate Lead — ${sanitize(p.name)}`,
    color: COLOR_ALERT,
    description: "A contact with the same phone/email already exists in GHL. This ping has been suppressed from #new-leads.",
    fields: [
      { name: "📱 Phone",            value: p.phone              || "—", inline: true },
      { name: "📧 Email",            value: p.email              || "—", inline: true },
      { name: "🆔 Existing Contact", value: sanitize(p.existingContactId, 100), inline: false },
      { name: "🆕 New Contact ID",   value: sanitize(p.newContactId, 100),      inline: false },
    ],
    footer:    { text: "SNS Duplicate Detection" },
    timestamp: new Date().toISOString(),
  };
}

// ── No-show ───────────────────────────────────────────────────────────────────

export function buildNoShowEmbed(p: {
  name: string;
  dateTime?: string;
  assignedRep?: string;
}): DiscordEmbed {
  const formatted = p.dateTime
    ? new Date(p.dateTime).toLocaleString("en-US", {
        weekday: "short", month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit", timeZoneName: "short",
      })
    : "—";

  return {
    title: `👻 No-Show — ${sanitize(p.name)}`,
    color: COLOR_NO_SHOW,
    description: "This contact did not show for their appointment. Consider rebooking immediately.",
    fields: [
      { name: "🗓️ Scheduled",  value: formatted,                            inline: false },
      { name: "👤 Rep",         value: sanitize(p.assignedRep || "—"),        inline: true  },
    ],
    footer:    { text: "SNS Notifications" },
    timestamp: new Date().toISOString(),
  };
}

// ── Canceled appointment ──────────────────────────────────────────────────────

export function buildCanceledEmbed(p: {
  name: string;
  dateTime?: string;
  assignedRep?: string;
}): DiscordEmbed {
  const formatted = p.dateTime
    ? new Date(p.dateTime).toLocaleString("en-US", {
        weekday: "short", month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit", timeZoneName: "short",
      })
    : "—";

  return {
    title: `❌ Appointment Canceled — ${sanitize(p.name)}`,
    color: COLOR_NO_SHOW,
    description: "This appointment was canceled. Attempt to rebook.",
    fields: [
      { name: "🗓️ Was Scheduled", value: formatted,                           inline: false },
      { name: "👤 Rep",            value: sanitize(p.assignedRep || "—"),       inline: true  },
    ],
    footer:    { text: "SNS Notifications" },
    timestamp: new Date().toISOString(),
  };
}

// ── Daily / weekly pipeline summary ──────────────────────────────────────────

export function buildLeadPipelineSummaryEmbed(p: {
  isWeekly: boolean;
  dateLabel: string;
  leads: number;
  booked: number;
  shows: number;
  noShows: number;
  showRate: string;
  bookRate: string;
  spend?: number;
  cpl?: string;
  cpba?: string;
  topCampaign?: string;
  topCampaignLeads?: number;
  // weekly extras
  prevLeads?: number;
  prevBooked?: number;
}): DiscordEmbed {
  const title = p.isWeekly
    ? `📊 Weekly Pipeline Report — ${sanitize(p.dateLabel)}`
    : `📋 Daily Pipeline Summary — ${sanitize(p.dateLabel)}`;

  const fields: DiscordEmbedField[] = [
    { name: "📥 Leads In",       value: String(p.leads),    inline: true },
    { name: "📅 Booked",         value: String(p.booked),   inline: true },
    { name: "✅ Showed",         value: String(p.shows),    inline: true },
    { name: "👻 No-Shows",       value: String(p.noShows),  inline: true },
    { name: "📈 Show Rate",      value: p.showRate,         inline: true },
    { name: "🎯 Book Rate",      value: p.bookRate,         inline: true },
  ];

  if (p.spend !== undefined) {
    fields.push(
      { name: "💸 Ad Spend",   value: `$${p.spend.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, inline: true },
      { name: "💰 CPL",        value: p.cpl  ?? "—", inline: true },
      { name: "📆 CPBA",       value: p.cpba ?? "—", inline: true },
    );
  }

  if (p.topCampaign) {
    fields.push({
      name: "🏆 Top Campaign",
      value: `${sanitize(p.topCampaign)} (${p.topCampaignLeads ?? 0} leads)`,
      inline: false,
    });
  }

  if (p.isWeekly && p.prevLeads !== undefined && p.prevBooked !== undefined) {
    const leadDelta  = p.leads  - p.prevLeads;
    const bookedDelta = p.booked - p.prevBooked;
    fields.push({
      name: "📉 Week-over-Week",
      value: [
        `Leads: ${leadDelta >= 0 ? "+" : ""}${leadDelta} vs prior week`,
        `Booked: ${bookedDelta >= 0 ? "+" : ""}${bookedDelta} vs prior week`,
      ].join("\n"),
      inline: false,
    });
  }

  return {
    title,
    color: COLOR_SUMMARY,
    fields,
    footer:    { text: p.isWeekly ? "SNS Weekly Rollup" : "SNS Daily Rollup" },
    timestamp: new Date().toISOString(),
  };
}

export async function sendDiscordDM(userId: string, content: string): Promise<void> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token || !userId) return;

  const ch = await fetch(`${DISCORD_API}/users/@me/channels`, {
    method: "POST",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipient_id: userId }),
    signal: AbortSignal.timeout(8000),
  });
  if (!ch.ok) return;
  const { id: channelId } = await ch.json() as { id: string };

  await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
    signal: AbortSignal.timeout(8000),
  });
}
