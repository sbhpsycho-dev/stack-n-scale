import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import type { Lead, LeadContact } from "@/lib/lead-types";

const TOUCH_MESSAGES = [
  (name: string, link: string) =>
    `Hey ${name} — looks like we missed each other. Totally get it, life happens.\nWant to get you rescheduled — ${link}. Evan's team`,
  (name: string, link: string) =>
    `${name} — still want to connect. Spots are limited this week.\nGrab a time here: ${link}`,
  (name: string) =>
    `Last reach out ${name} — don't want to keep blowing up your phone.\nIf you're still interested, here's the link: ${process.env.CALENDLY_LINK ?? "[link]"}. If not, no hard feelings.`,
];

async function sendSms(phone: string, message: string) {
  const url = process.env.MAKE_SMS_WEBHOOK_URL;
  if (!url || !phone) return;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "followup", phone, message }),
    signal: AbortSignal.timeout(5000),
  }).catch(e => console.error("Follow-up SMS error:", e));
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "admin" && session.user.role !== "staff")) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: { leadId: string; touchNumber?: number };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const lead = await kv.get<Lead>(`sns:leads:${body.leadId}`);
  if (!lead) return Response.json({ error: "Lead not found" }, { status: 404 });

  const touchNumber = body.touchNumber ?? (lead.contactHistory.length + 1);
  const idx         = Math.min(touchNumber - 1, TOUCH_MESSAGES.length - 1);
  const [firstName] = lead.name.split(" ");
  const calLink     = process.env.CALENDLY_LINK ?? "[booking link]";
  const message     = TOUCH_MESSAGES[idx](firstName, calLink);

  await sendSms(lead.phone ?? "", message);

  const contact: LeadContact = {
    type:        "sms",
    touchNumber,
    sentAt:      new Date().toISOString(),
    message,
  };

  const updated: Lead = {
    ...lead,
    state:          "contacted",
    updatedAt:      new Date().toISOString(),
    contactHistory: [...lead.contactHistory, contact],
  };
  await kv.set(`sns:leads:${lead.id}`, updated);

  return Response.json({ ok: true, touchNumber, message });
}
