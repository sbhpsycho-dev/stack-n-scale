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
