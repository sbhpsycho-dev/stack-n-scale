import { kv } from "@vercel/kv";
import { randomUUID } from "crypto";
import type { Deal, DealPayout } from "@/lib/deal-types";
import { calculatePayouts } from "@/lib/payout-calc";

export const runtime = "nodejs";

type GHLPayload = {
  type?: string;
  opportunity?: {
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
};

export async function POST(req: Request) {
  const secret = process.env.GHL_WEBHOOK_SECRET;
  if (!secret) return new Response("Webhook not configured", { status: 500 });
  const provided = req.headers.get("x-ghl-secret");
  if (provided !== secret) return new Response("Unauthorized", { status: 401 });

  let payload: GHLPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const type = (payload.type ?? "").toLowerCase();
  if (!type.includes("opportunity")) return new Response("ok", { status: 200 });

  const opp = payload.opportunity ?? {};
  const status = (opp.status ?? "").toLowerCase();
  if (status !== "won") return new Response("ok", { status: 200 });

  const ghlId = opp.id ?? "";
  if (!ghlId) return new Response("ok", { status: 200 });

  // Dedupe — check if a deal with this GHL ID is already in the index
  const dealIds = (await kv.get<string[]>("sns:deals:index")) ?? [];
  const existing = (
    await Promise.all(dealIds.map(id => kv.get<Deal>(`sns:deals:${id}`)))
  ).find(d => d?.notes?.includes(ghlId));
  if (existing) return new Response("ok", { status: 200 });

  const contact = opp.contact ?? {};
  const clientName = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.name || "Unknown";
  const grossAmount = opp.monetaryValue ?? opp.value ?? 0;
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

  const discordUrl = process.env.DISCORD_WEBHOOK_DEAL_CLOSED ?? "";
  if (discordUrl) {
    const formatted = `$${grossAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
    const safeName   = clientName.replace(/@(?:everyone|here)/g, "@​$&").replace(/[[\]()]/g, "").slice(0, 100);
    const safeSetter = setter ? setter.replace(/@(?:everyone|here)/g, "@​$&").replace(/[[\]()]/g, "").slice(0, 100) : null;
    fetch(discordUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: `🔥 **DEAL CLOSED — GHL**\n**${safeName}** — ${formatted}${safeSetter ? `\nSetter: **${safeSetter}**` : ""}`,
      }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {});
  }

  return new Response("ok", { status: 200 });
}
