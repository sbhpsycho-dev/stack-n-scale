/**
 * One-time setup endpoint — creates Discord notification channels + webhooks
 * and registers the GHL webhook subscription.
 *
 * Call once after deploy:
 *   GET https://stack-n-scale.vercel.app/api/admin/discord-notify-setup?secret=YOUR_CRON_SECRET
 *
 * Returns JSON with the created webhook URLs — add them to Vercel env vars.
 */

import { randomUUID } from "crypto";
import { kv } from "@vercel/kv";

export const runtime = "nodejs";

const DISCORD_API  = "https://discord.com/api/v10";
const GHL_API      = "https://services.leadconnectorhq.com";
const WEBHOOK_NAME = "SNS Notifications";

const NOTIFY_CHANNELS = [
  { name: "new-leads",           envKey: "DISCORD_WEBHOOK_NEW_LEADS"    },
  { name: "appointments-booked", envKey: "DISCORD_WEBHOOK_APPOINTMENTS" },
  { name: "sales",               envKey: "DISCORD_WEBHOOK_SALES"        },
  { name: "rep-updates",         envKey: "DISCORD_WEBHOOK_REP_UPDATES"  },
];

const GHL_EVENTS = [
  "ContactCreate",
  "AppointmentCreate",
  "CalendarEventCreate",
  "InboundMessage",
  "ConversationUnreadUpdate",
  "OpportunityCreate",
  "OpportunityUpdate",
  "OpportunityStatusUpdate",
];

async function discordApi(path: string, method = "GET", body?: object) {
  const token = process.env.DISCORD_BOT_TOKEN!;
  const r = await fetch(`${DISCORD_API}${path}`, {
    method,
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10000),
  });
  if (r.status === 204) return { ok: true };
  return r.json();
}

async function ghlApi(path: string, method = "GET", body?: object) {
  const key = process.env.GHL_API_KEY!;
  const r = await fetch(`${GHL_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Version: "2021-07-28",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10000),
  });
  const json = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data: json };
}

export async function GET(req: Request): Promise<Response> {
  // Auth check
  const { searchParams } = new URL(req.url);
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && searchParams.get("secret") !== cronSecret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const botToken  = process.env.DISCORD_BOT_TOKEN;
  const guildId   = process.env.DISCORD_GUILD_ID;
  const ghlApiKey = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;

  if (!botToken || !guildId) {
    return Response.json({ error: "DISCORD_BOT_TOKEN and DISCORD_GUILD_ID are required" }, { status: 500 });
  }

  const results: Record<string, string> = {};
  const log: string[] = [];

  // ── Step 1: Create Discord channels + webhooks ────────────────────────────

  log.push("Fetching existing Discord channels...");
  const existing = await discordApi(`/guilds/${guildId}/channels`) as Array<{ id: string; name: string }>;
  const byName = Object.fromEntries(existing.map((ch: { id: string; name: string }) => [ch.name, ch]));
  log.push(`Found ${existing.length} existing channels`);

  for (const { name, envKey } of NOTIFY_CHANNELS) {
    let channel = byName[name];

    if (!channel) {
      log.push(`Creating #${name}...`);
      channel = await discordApi(`/guilds/${guildId}/channels`, "POST", { name, type: 0 }) as { id: string; name: string };
      log.push(`Created #${name} (${channel.id})`);
    } else {
      log.push(`#${name} already exists (${channel.id})`);
    }

    // Check for existing SNS webhook
    const webhooks = await discordApi(`/channels/${channel.id}/webhooks`) as Array<{ id: string; name: string; token: string }>;
    const existingHook = Array.isArray(webhooks) && webhooks.find((w: { name: string }) => w.name === WEBHOOK_NAME);

    if (existingHook) {
      log.push(`Reusing existing webhook for #${name}`);
      results[envKey] = `https://discord.com/api/webhooks/${existingHook.id}/${existingHook.token}`;
    } else {
      log.push(`Creating webhook for #${name}...`);
      const hook = await discordApi(`/channels/${channel.id}/webhooks`, "POST", { name: WEBHOOK_NAME }) as { id: string; token: string };
      results[envKey] = `https://discord.com/api/webhooks/${hook.id}/${hook.token}`;
      log.push(`Created webhook for #${name}`);
    }

    // Store webhook URL in KV as fallback (so code works even before Vercel env vars are updated)
    await kv.set(`sns:config:${envKey}`, results[envKey]);
  }

  // ── Step 2: Register GHL webhook ─────────────────────────────────────────

  let ghlResult: Record<string, string> = {};

  if (ghlApiKey && locationId) {
    log.push("Checking existing GHL webhooks...");

    const appUrl = "https://stack-n-scale.vercel.app";

    // Get or generate webhook secret
    let whSecret = process.env.GHL_WEBHOOK_SECRET;
    if (!whSecret) {
      whSecret = await kv.get<string>("sns:config:GHL_WEBHOOK_SECRET") ?? randomUUID();
      await kv.set("sns:config:GHL_WEBHOOK_SECRET", whSecret);
      log.push(`Generated GHL_WEBHOOK_SECRET (stored in KV)`);
    }

    const webhookUrl = `${appUrl}/api/webhooks/ghl?secret=${encodeURIComponent(whSecret)}`;

    const listRes = await ghlApi(`/webhooks/?locationId=${locationId}`);
    if (listRes.ok) {
      const webhooks = listRes.data?.webhooks ?? [];
      const alreadyRegistered = webhooks.find((w: { url?: string; name?: string }) =>
        w.name === "SNS Discord Notifications" || w.url?.includes("/api/webhooks/ghl")
      );

      if (alreadyRegistered) {
        log.push(`GHL webhook already registered (id: ${alreadyRegistered.id})`);
        ghlResult = { id: alreadyRegistered.id, status: "already_registered" };
      } else {
        log.push("Registering GHL webhook...");
        const createRes = await ghlApi("/webhooks", "POST", {
          locationId,
          name:   "SNS Discord Notifications",
          url:    webhookUrl,
          events: GHL_EVENTS,
        });

        if (createRes.ok) {
          const hook = createRes.data?.webhook ?? createRes.data;
          log.push(`GHL webhook registered (id: ${hook.id})`);
          ghlResult = { id: hook.id, status: "registered", secret: whSecret };
        } else {
          log.push(`GHL webhook registration failed: ${JSON.stringify(createRes.data)}`);
          ghlResult = { status: "failed", error: JSON.stringify(createRes.data) };
        }
      }
    } else {
      log.push(`Could not list GHL webhooks: ${JSON.stringify(listRes.data)}`);
    }
  } else {
    log.push("GHL_API_KEY or GHL_LOCATION_ID not set — skipping GHL registration");
  }

  return Response.json({
    success: true,
    log,
    discordWebhooks: results,
    ghl: ghlResult,
    next: [
      "Add these to Vercel env vars (Production):",
      ...Object.entries(results).map(([k, v]) => `${k}=${v}`),
      ...(ghlResult.secret ? [`GHL_WEBHOOK_SECRET=${ghlResult.secret}`] : []),
      "Then redeploy: vercel --prod",
    ],
  });
}
