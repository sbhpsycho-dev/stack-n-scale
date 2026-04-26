import Stripe from "stripe";
import { kv } from "@vercel/kv";
import { createContact, getContactByEmail, addTag } from "@/lib/ghl";
import { triggerEmail } from "@/lib/email";

function stripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-03-25.dahlia" });
}

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("Missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  if (event.type !== "checkout.session.completed" && event.type !== "payment_intent.succeeded") {
    return Response.json({ received: true });
  }

  const obj = event.data.object as Stripe.Checkout.Session | Stripe.PaymentIntent;
  const metadata = (obj as Stripe.Checkout.Session).metadata ?? (obj as Stripe.PaymentIntent).metadata ?? {};

  const email =
    metadata.email ??
    (obj as Stripe.Checkout.Session).customer_email ??
    (obj as Stripe.Checkout.Session).customer_details?.email ??
    "";

  const name =
    metadata.name ??
    metadata.client_name ??
    (obj as Stripe.Checkout.Session).customer_details?.name ??
    "";
  const phone = metadata.phone ?? "";
  const amountCents = (obj as Stripe.Checkout.Session).amount_total ?? (obj as Stripe.PaymentIntent).amount ?? 0;
  const amount = (amountCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

  if (!email) return Response.json({ received: true, skipped: "no email" });

  const [firstName, ...rest] = name.trim().split(" ");
  const lastName = rest.join(" ") || undefined;

  let ghlContactId: string;
  try {
    const existing = await getContactByEmail(email);
    if (existing) {
      ghlContactId = existing.id;
    } else {
      const contact = await createContact({ firstName: firstName || email, lastName, email, phone });
      ghlContactId = contact.id;
    }
    await addTag(ghlContactId, "payment_received");
  } catch (err) {
    console.error("GHL error:", err);
    return Response.json({ received: true, ghlError: String(err) }, { status: 200 });
  }

  const clientKey = `sns:coaching:client:${email}`;
  await kv.set(clientKey, {
    ghlContactId,
    name: name || email,
    email,
    phone,
    status: "payment_received",
    createdAt: new Date().toISOString(),
    idVerification: "pending",
    driveFolder: null,
  });

  triggerEmail("welcome", email, name || email).catch(console.error);

  if (process.env.DISCORD_WEBHOOK_URL) {
    fetch(process.env.DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: `💰 New payment received from **${name || email}** — ${amount}` }),
    }).catch(console.error);
  }

  return Response.json({ received: true, ghlContactId });
}
