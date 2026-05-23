import { kv } from "@vercel/kv";
import { randomUUID } from "crypto";
import type { Deal, DealPayout } from "@/lib/deal-types";
import { calculatePayouts } from "@/lib/payout-calc";
import { deduplicateNotif } from "@/lib/notif-dedup";
import {
  sendWebhookEmbed,
  buildNewLeadEmbed,
  buildAppointmentEmbed,
  buildLeadReplyEmbed,
  buildDealClosedEmbed,
} from "@/lib/discord";

export const runtime = "nodejs";

// ── GHL payload types ─────────────────────────────────────────────────────────

type GHLContact = {
  id?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
  source?: string;
  tags?: string[];
  assignedTo?: string;
  pipeline?: { name?: string; stage?: string };
  campaign?: string;
};

type GHLAppointment = {
  id?: string;
  title?: string;
  startTime?: string;
  calendarId?: string;
  calendarName?: string;
  assignedUserId?: string;
  contact?: { firstName?: string; lastName?: string; name?: string; phone?: string };
};

type GHLMessage = {
  id?: string;
  contactId?: string;
  body?: string;
  direction?: string; // "inbound" | "outbound"
  type?: string;      // "SMS" | "Email" | etc.
  contact?: { firstName?: string; lastName?: string; name?: string };
};

type GHLOpportunity = {
  id?: string;
  name?: string;
  monetaryValue?: number;
  value?: number;
  status?: string;
  source?: string;
  leadSource?: string;
  createdAt?: string;
  dateAdded?: string;
  contact?: { firstName?: string; lastName?: string; name?: string };
  assignedTo?: string;
};

type GHLPayload = {
  type?: string;
  contact?: GHLContact;
  appointment?: GHLAppointment;
  message?: GHLMessage;
  conversation?: { id?: string; contactId?: string };
  opportunity?: GHLOpportunity;
};

// ── Normalize event type: lowercase, strip dots / underscores / dashes / spaces
function normalizeType(t: string): string {
  return t.toLowerCase().replace(/[\s._-]/g, "");
}

// ── Resolve webhook URL: env var first, KV fallback (set by /api/admin/discord-notify-setup)
async function webhookUrl(envKey: string): Promise<string> {
  return process.env[envKey] || await kv.get<string>(`sns:config:${envKey}`) || "";
}

// ── Event handlers ────────────────────────────────────────────────────────────

async function handleContactCreate(payload: GHLPayload): Promise<Response> {
  const c = payload.contact ?? {};
  const contactId = c.id ?? "";

  const isNew = await deduplicateNotif("contact.create", contactId);
  if (!isNew) return new Response("ok", { status: 200 });

  const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || c.name || "Unknown";

  void sendWebhookEmbed(
    await webhookUrl("DISCORD_WEBHOOK_NEW_LEADS"),
    buildNewLeadEmbed({
      name,
      phone:       c.phone,
      source:      c.source,
      assignedRep: c.assignedTo,
      stage:       c.pipeline?.stage,
      campaign:    c.campaign,
    })
  );

  return new Response("ok", { status: 200 });
}

async function handleAppointment(payload: GHLPayload): Promise<Response> {
  const appt = payload.appointment ?? {};
  const apptId = appt.id ?? "";

  const isNew = await deduplicateNotif("appointment.create", apptId);
  if (!isNew) return new Response("ok", { status: 200 });

  const contact = appt.contact ?? {};
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.name || "Unknown";

  void sendWebhookEmbed(
    await webhookUrl("DISCORD_WEBHOOK_APPOINTMENTS"),
    buildAppointmentEmbed({
      name,
      dateTime:     appt.startTime,
      calendarName: appt.calendarName,
      assignedRep:  appt.assignedUserId,
    })
  );

  return new Response("ok", { status: 200 });
}

async function handleLeadReply(payload: GHLPayload): Promise<Response> {
  const msg = payload.message ?? {};
  const msgId = msg.id ?? "";

  // Only notify on inbound (lead replying to us, not our outbound messages)
  if (msg.direction && msg.direction.toLowerCase() !== "inbound") {
    return new Response("ok", { status: 200 });
  }

  const isNew = await deduplicateNotif("inbound.message", msgId);
  if (!isNew) return new Response("ok", { status: 200 });

  const contact = msg.contact ?? {};
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.name || "Unknown";

  void sendWebhookEmbed(
    await webhookUrl("DISCORD_WEBHOOK_SALES"),
    buildLeadReplyEmbed({
      name,
      message: msg.body,
      channel: msg.type,
    })
  );

  return new Response("ok", { status: 200 });
}

async function handleOpportunity(payload: GHLPayload): Promise<Response> {
  const opp = payload.opportunity ?? {};
  const status = (opp.status ?? "").toLowerCase();
  if (status !== "won") return new Response("ok", { status: 200 });

  const ghlId = opp.id ?? "";
  if (!ghlId) return new Response("ok", { status: 200 });

  // Fast O(1) dedup — short-circuits before the expensive O(n) deals index scan
  const isNew = await deduplicateNotif("opportunity.won", ghlId);
  if (!isNew) return new Response("ok", { status: 200 });

  // Secondary check: deals index (preserves existing behavior / catches pre-dedup records)
  const dealIds = (await kv.get<string[]>("sns:deals:index")) ?? [];
  const existing = (
    await Promise.all(dealIds.map(id => kv.get<Deal>(`sns:deals:${id}`)))
  ).find(d => d?.notes?.includes(ghlId));
  if (existing) return new Response("ok", { status: 200 });

  const contact = opp.contact ?? {};
  const clientName =
    [contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
    contact.name ||
    "Unknown";
  // Coerce to number — GHL API webhooks sometimes send monetary values as strings
  const grossAmount = Number(opp.monetaryValue ?? opp.value ?? 0) || 0;
  const rawSource = (opp.source ?? opp.leadSource ?? "").toLowerCase();
  const leadSource: "ad" | "organic" = rawSource.includes("ad") ? "ad" : "organic";
  const createdAt = opp.createdAt ?? opp.dateAdded ?? new Date().toISOString();
  const date = createdAt.slice(0, 10);
  const setter = opp.assignedTo?.trim() || null;

  const dealId = randomUUID();
  const stub: Deal = {
    id: dealId,
    date,
    clientName,
    offer: grossAmount <= 5000 ? "5K" : "10K",
    grossAmount,
    processor: "stripe",
    processorFee: 0,
    netAmount: grossAmount,
    leadSource,
    dmSetter: null,
    setter,
    closer: null,
    payoutStatus: "pending",
    notes: `Auto-created from GHL | id:${ghlId}`,
    payouts: {} as DealPayout,
  };
  const deal: Deal = { ...stub, payouts: calculatePayouts(stub) };

  await kv.set(`sns:deals:${dealId}`, deal);
  await kv.set("sns:deals:index", [dealId, ...dealIds]);

  void sendWebhookEmbed(
    await webhookUrl("DISCORD_WEBHOOK_SALES"),
    buildDealClosedEmbed({
      name:       clientName,
      amount:     grossAmount,
      setter:     setter ?? undefined,
      offer:      deal.offer,
      leadSource: deal.leadSource,
    })
  );

  return new Response("ok", { status: 200 });
}

// ── Dispatch table ────────────────────────────────────────────────────────────
// Normalized keys: lowercase, no dots/underscores/dashes/spaces.
// GHL sends inconsistent casing + has a known "statuscahnge" typo.

const EVENT_HANDLERS: Record<string, (payload: GHLPayload) => Promise<Response>> = {
  "contactcreate":            handleContactCreate,
  "contactcreated":           handleContactCreate,
  "appointmentcreate":        handleAppointment,
  "appointmentcreated":       handleAppointment,
  "calendareventcreate":      handleAppointment,
  "calendareventcreated":     handleAppointment,
  "bookingcreate":            handleAppointment,
  "bookingcreated":           handleAppointment,
  "conversationunreadupdate": handleLeadReply,
  "inboundmessage":           handleLeadReply,
  "opportunitystatuschange":  handleOpportunity, // correct spelling
  "opportunitystatuscahnge":  handleOpportunity, // GHL known typo
  "opportunitycreate":        handleOpportunity,
  "opportunitycreated":       handleOpportunity,
  "opportunityupdate":        handleOpportunity,
  "opportunityupdated":       handleOpportunity,
};

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  // Secret: check env var first, fall back to KV (set by /api/admin/discord-notify-setup)
  const secret = process.env.GHL_WEBHOOK_SECRET || await kv.get<string>("sns:config:GHL_WEBHOOK_SECRET");
  if (!secret) return new Response("Webhook not configured", { status: 500 });

  // Accept secret via header (manual webhook setup) OR query param (API-registered webhook)
  const { searchParams } = new URL(req.url);
  const provided = req.headers.get("x-ghl-secret") ?? searchParams.get("secret") ?? "";
  if (provided !== secret) return new Response("Unauthorized", { status: 401 });

  let payload: GHLPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const eventType = normalizeType(payload.type ?? "");
  if (!eventType) return new Response("ok", { status: 200 });

  const handler = EVENT_HANDLERS[eventType];
  if (!handler) {
    console.log(`[ghl-webhook] unhandled event type: "${payload.type}"`);
    return new Response("ok", { status: 200 });
  }

  return handler(payload);
}
