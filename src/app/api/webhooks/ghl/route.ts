import { kv } from "@vercel/kv";
import { randomUUID } from "crypto";
import { verifySecret } from "@/lib/webhook-auth";
import type { Deal, DealPayout } from "@/lib/deal-types";
import { calculatePayouts } from "@/lib/payout-calc";
import { deduplicateNotif } from "@/lib/notif-dedup";
import {
  sendWebhookEmbed,
  buildNewLeadEmbed,
  buildAppointmentEmbed,
  buildLeadReplyEmbed,
  buildDealClosedEmbed,
  buildDupeLeadEmbed,
  buildNoShowEmbed,
  buildCanceledEmbed,
} from "@/lib/discord";
import {
  trackNewLead,
  markLeadContacted,
  checkDuplicate,
  registerContact,
  incrementMetrics,
  todayET,
} from "@/lib/lead-pipeline";

export const runtime = "nodejs";

// ── GHL payload types ─────────────────────────────────────────────────────────

type GHLCustomField = { id?: string; key?: string; value?: string };

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
  customFields?: GHLCustomField[];
};

type GHLAppointment = {
  id?: string;
  title?: string;
  startTime?: string;
  calendarId?: string;
  calendarName?: string;
  assignedUserId?: string;
  status?: string;
  contact?: { id?: string; firstName?: string; lastName?: string; name?: string; phone?: string };
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

// ── Campaign attribution from Meta UTM custom fields ──────────────────────────

/**
 * Build a composite campaign label from GHL custom fields.
 * Tries several known key names for utm_campaign / ad set / ad name.
 * Falls back to the contact.campaign field if custom fields are absent.
 *
 * Returns "Campaign / Ad Set / Ad" if all three are present,
 * or whatever subset is available, or "—" if nothing is set.
 */
function extractCampaign(c: GHLContact): string {
  const fields = c.customFields ?? [];

  const get = (...keys: string[]): string => {
    const keySet = new Set(keys.map(k => k.toLowerCase()));
    return (
      fields.find(f => {
        const k = (f.key ?? f.id ?? "").toLowerCase();
        return keySet.has(k);
      })?.value ?? ""
    ).trim();
  };

  const campaign = get("utm_campaign", "fb_campaign_name", "campaign_name");
  const adset    = get("utm_adset", "utm_ad_set", "adset_name", "ad_set_name");
  const ad       = get("utm_ad", "utm_content", "ad_name");

  const parts = [campaign, adset, ad].filter(Boolean);
  return parts.length ? parts.join(" / ") : (c.campaign?.trim() || "—");
}

// ── Event handlers ────────────────────────────────────────────────────────────

async function handleContactCreate(payload: GHLPayload): Promise<Response> {
  const c = payload.contact ?? {};
  const contactId = c.id ?? "";
  const dateStr = todayET();

  // ── 1. ID-based dedup (prevents double-fire on GHL retry)
  const isNew = await deduplicateNotif("contact.create", contactId);
  if (!isNew) return new Response("ok", { status: 200 });

  const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || c.name || "Unknown";
  const campaignLabel = extractCampaign(c);

  // ── 2. Phone/email duplicate detection
  const dupeId = await checkDuplicate(c.phone, c.email);
  if (dupeId && dupeId !== contactId) {
    // Suppress from #new-leads — post a flagged warning to #alerts instead
    void sendWebhookEmbed(
      await webhookUrl("DISCORD_WEBHOOK_ALERTS"),
      buildDupeLeadEmbed({
        name,
        phone:             c.phone,
        email:             c.email,
        existingContactId: dupeId,
        newContactId:      contactId,
      })
    );
    return new Response("ok", { status: 200 });
  }

  // ── 3. Register this contact's phone/email for future dupe checks
  await registerContact(contactId, c.phone, c.email);

  // ── 4. Post to #new-leads
  void sendWebhookEmbed(
    await webhookUrl("DISCORD_WEBHOOK_NEW_LEADS"),
    buildNewLeadEmbed({
      name,
      phone:       c.phone,
      source:      c.source,
      assignedRep: c.assignedTo,
      stage:       c.pipeline?.stage,
      campaign:    campaignLabel,
    })
  );

  // ── 5. Start speed-to-lead timer + increment daily lead counter
  await trackNewLead(contactId, name, c.phone, campaignLabel, dateStr);

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

  // Clear speed-to-lead timer — booking counts as "worked"
  const contactId = contact.id ?? "";
  if (contactId) await markLeadContacted(contactId);

  // Increment booked counter
  await incrementMetrics("booked", undefined, todayET());

  return new Response("ok", { status: 200 });
}

async function handleAppointmentStatusChange(payload: GHLPayload): Promise<Response> {
  const appt   = payload.appointment ?? {};
  const status = (appt.status ?? "").toLowerCase().replace(/[\s_-]/g, "");

  const cancelStatuses  = ["canceled", "cancelled"];
  const noshowStatuses  = ["noshow", "noshowed"];
  const isCancel  = cancelStatuses.includes(status);
  const isNoShow  = noshowStatuses.includes(status);

  if (!isCancel && !isNoShow) return new Response("ok", { status: 200 });

  // Dedup by apptId + status to prevent double-ping on retries
  const isNew = await deduplicateNotif(`appt.${status}`, appt.id ?? "");
  if (!isNew) return new Response("ok", { status: 200 });

  const contact = appt.contact ?? {};
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.name || "Unknown";

  if (isNoShow) {
    await incrementMetrics("noshow", undefined, todayET());
    void sendWebhookEmbed(
      await webhookUrl("DISCORD_WEBHOOK_APPOINTMENTS"),
      buildNoShowEmbed({
        name,
        dateTime:    appt.startTime,
        assignedRep: appt.assignedUserId,
      })
    );
  } else {
    void sendWebhookEmbed(
      await webhookUrl("DISCORD_WEBHOOK_APPOINTMENTS"),
      buildCanceledEmbed({
        name,
        dateTime:    appt.startTime,
        assignedRep: appt.assignedUserId,
      })
    );
  }

  return new Response("ok", { status: 200 });
}

/**
 * Handles outbound messages and logged calls.
 * Clears the speed-to-lead pending timer so the rep doesn't get pinged
 * after they've already reached out.
 */
async function handleOutboundContact(payload: GHLPayload): Promise<Response> {
  const contactId =
    payload.message?.contactId ??
    payload.conversation?.contactId ??
    "";

  if (contactId) await markLeadContacted(contactId);
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

  // Trigger a background dashboard refresh so sns-dashboard-v1 reflects this deal immediately
  const appUrl = (process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "");
  if (appUrl && process.env.CRON_SECRET) {
    void fetch(`${appUrl}/api/admin/sync-leaderboard`, {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    }).catch(() => {});
  }

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
  // New lead / contact
  "contactcreate":            handleContactCreate,
  "contactcreated":           handleContactCreate,

  // Appointment booked
  "appointmentcreate":        handleAppointment,
  "appointmentcreated":       handleAppointment,
  "calendareventcreate":      handleAppointment,
  "calendareventcreated":     handleAppointment,
  "bookingcreate":            handleAppointment,
  "bookingcreated":           handleAppointment,

  // Appointment status changes (no-show / cancel)
  "appointmentstatuschange":  handleAppointmentStatusChange,
  "appointmentstatuscahnge":  handleAppointmentStatusChange, // GHL known typo
  "appointmentnoshow":        handleAppointmentStatusChange,
  "appointmentnoshowed":      handleAppointmentStatusChange,
  "appointmentcanceled":      handleAppointmentStatusChange,
  "appointmentcancelled":     handleAppointmentStatusChange,

  // Outbound contact (clears speed-to-lead timer)
  "outboundmessage":          handleOutboundContact,
  "outboundcall":             handleOutboundContact,
  "calllogged":               handleOutboundContact,
  "callcompleted":            handleOutboundContact,

  // Inbound reply from lead
  "conversationunreadupdate": handleLeadReply,
  "inboundmessage":           handleLeadReply,

  // Deal / opportunity closed
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
  if (!verifySecret(provided, secret)) return new Response("Unauthorized", { status: 401 });

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
