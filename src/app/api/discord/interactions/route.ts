import { kv } from "@vercel/kv";
import type { WeeklyPayout, Deal } from "@/lib/deal-types";
import { getWeekId, getWeekBounds } from "@/lib/payout-calc";
import { triggerOnboarding } from "@/lib/onboarding";

const EVAN_USER_ID = process.env.EVAN_DISCORD_USER_ID!;
const PUBLIC_KEY   = process.env.DISCORD_PUBLIC_KEY!;
const BOT_TOKEN    = process.env.DISCORD_BOT_TOKEN!;
const APP_ID       = process.env.DISCORD_CLIENT_ID!;

// rep first name (lowercase) → Discord user ID — loaded from env vars
const REP_IDS: Record<string, string> = Object.fromEntries(
  [
    ["caelum", process.env.DISCORD_REP_ID_CAELUM],
    ["kian",   process.env.DISCORD_REP_ID_KIAN],
    ["elias",  process.env.DISCORD_REP_ID_ELIAS],
    ["naomi",  process.env.DISCORD_REP_ID_NAOMI],
    ["callum", process.env.DISCORD_REP_ID_CALLUM],
    ["taha",   process.env.DISCORD_REP_ID_TAHA],
  ].filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0)
);

// ─── Crypto ──────────────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const buf   = new ArrayBuffer(hex.length / 2);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes as Uint8Array<ArrayBuffer>;
}

async function verifySignature(signature: string, timestamp: string, body: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      "raw", hexToBytes(PUBLIC_KEY), { name: "Ed25519" }, false, ["verify"]
    );
    return await crypto.subtle.verify(
      "Ed25519", key, hexToBytes(signature),
      new TextEncoder().encode(timestamp + body)
    );
  } catch { return false; }
}

// ─── Discord helpers ──────────────────────────────────────────────────────────

function fmt$(n: number) {
  return `$${(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function pct(part: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

function ephemeral(content: string) {
  return Response.json({ type: 4, data: { content, flags: 64 } });
}

async function openDM(userId: string): Promise<string | null> {
  const res = await fetch("https://discord.com/api/v10/users/@me/channels", {
    method: "POST",
    headers: { Authorization: `Bot ${BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipient_id: userId }),
  });
  if (!res.ok) return null;
  return (await res.json()).id ?? null;
}

async function sendDM(userId: string, content: string) {
  const channelId = await openDM(userId);
  if (!channelId) return;
  await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
}

async function editInteractionReply(token: string, content: string) {
  await fetch(`https://discord.com/api/v10/webhooks/${APP_ID}/${token}/messages/@original`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
}

// ─── Payout processing ────────────────────────────────────────────────────────

interface RepPayout {
  name: string;
  key:  string;
  amount: number;
  role: string;
  pctOfGross: number;
}

function buildRepPayouts(deals: Deal[]): RepPayout[] {
  const gross = deals.reduce((s, d) => s + d.grossAmount, 0);
  const net   = deals.reduce((s, d) => s + d.netAmount, 0);

  const totals: Record<string, { amount: number; role: string }> = {};

  // Caelum always
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

  return Object.entries(totals)
    .filter(([, v]) => v.amount > 0)
    .map(([key, v]) => ({
      name: key.charAt(0).toUpperCase() + key.slice(1),
      key,
      amount: v.amount,
      role: v.role,
      pctOfGross: gross > 0 ? Math.round((v.amount / gross) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}

async function processApproval(
  week: WeeklyPayout,
  token: string,
  bounds: { start: string; end: string }
) {
  // Fetch all deals
  const deals = (
    await Promise.all(week.dealIds.map(id => kv.get<Deal>(`sns:deals:${id}`)))
  ).filter((d): d is Deal => d !== null);

  const gross        = deals.reduce((s, d) => s + d.grossAmount, 0);
  const fees         = deals.reduce((s, d) => s + d.processorFee, 0);
  const totalPayouts = week.totals?.totalPayouts ?? 0;
  const evanNet      = week.totals?.evanTakeHome ?? 0;
  const repPayouts   = buildRepPayouts(deals);

  // ── Evan's full summary ──
  const lines = [
    `✅ **Payouts approved — week of ${bounds.start}**`,
    ``,
    `**💰 Summary**`,
    `Gross Collected: ${fmt$(gross)}`,
    `Processor Fees: -${fmt$(fees)}`,
    `Total Going Out: ${fmt$(totalPayouts)} (${pct(totalPayouts, gross)} of gross)`,
    `Evan Take Home: **${fmt$(evanNet)}** (${pct(evanNet, gross)} of gross)`,
    ``,
    `**📋 Payouts**`,
    ...repPayouts.map(r => `${r.name} — **${fmt$(r.amount)}** (${r.role})`),
    ``,
    `📦 ${deals.length} deal${deals.length !== 1 ? "s" : ""} | 📬 Everyone's been DM'd their cut.`,
  ];

  // Update Evan's deferred reply with full breakdown
  await editInteractionReply(token, lines.join("\n"));

  // DM each rep their individual info only
  await Promise.allSettled(
    repPayouts.map(async (rep) => {
      const discordId = REP_IDS[rep.key];
      if (!discordId) return;

      let message: string;

      if (rep.key === "caelum") {
        // Caelum is a partner — sees week totals + his cut
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
        // Sales reps — only their own deals and their own cut
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

      await sendDM(discordId, message);
    })
  );
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const signature = req.headers.get("x-signature-ed25519") ?? "";
  const timestamp = req.headers.get("x-signature-timestamp") ?? "";
  const rawBody   = await req.text();

  const valid = await verifySignature(signature, timestamp, rawBody);
  if (!valid) return new Response("Invalid signature", { status: 401 });

  const interaction = JSON.parse(rawBody);

  // Discord PING
  if (interaction.type === 1) return Response.json({ type: 1 });

  if (interaction.type === 2) {
    const userId  = interaction.member?.user?.id ?? interaction.user?.id;
    const command = interaction.data?.name as string;

    // ── /new-client ───────────────────────────────────────────────────────
    if (command === "new-client") {
      const CAELUM_ID = process.env.DISCORD_CAELUM_USER_ID;
      if (userId !== EVAN_USER_ID && userId !== CAELUM_ID) {
        return ephemeral("❌ Only Evan or Caelum can use this command.");
      }

      const opts = (interaction.data?.options ?? []) as Array<{ name: string; value: string | number }>;
      const get  = (k: string) => opts.find(o => o.name === k)?.value;

      const name    = String(get("name")    ?? "").trim();
      const email   = String(get("email")   ?? "").toLowerCase().trim();
      const dollars = Number(get("amount")  ?? 0);
      const program = String(get("program") ?? "standard") as "standard" | "vip";

      if (!name || !email || !dollars) {
        return ephemeral("❌ Missing required fields — name, email, and amount are all required.");
      }

      const token = interaction.token as string;

      triggerOnboarding({
        name,
        email,
        amountCents: dollars * 100,
        programType: program,
        paymentId:   `discord-${Date.now()}`,
        source:      "discord",
      }).then(result =>
        editInteractionReply(token,
          result.ok
            ? `✅ **${name}** is in the system.\nGHL contact created · Drive folder ready · welcome sequence triggered.`
            : `⚠️ Partial success — check logs.\n${result.error ?? ""}`
        )
      ).catch(e => editInteractionReply(token, `❌ Error: ${String(e)}`));

      return Response.json({ type: 5, data: { flags: 64 } });
    }

    // /approve and /decline are Evan-only
    if (userId !== EVAN_USER_ID) {
      return ephemeral("❌ Only Evan can use this command.");
    }

    // ── /approve ─────────────────────────────────────────────────────────
    if (command === "approve") {
      const weekId  = getWeekId();
      const bounds  = getWeekBounds(weekId);
      const weekKey = `sns:payouts:weekly:${weekId}`;
      const week    = await kv.get<WeeklyPayout>(weekKey);

      if (!week?.dealIds?.length) {
        return ephemeral("📭 No deals logged for this week yet. Nothing to approve.");
      }
      if (week.status === "approved" || week.status === "paid") {
        return ephemeral(`⚠️ This week's payouts are already **${week.status}**.`);
      }

      await kv.set(weekKey, { ...week, status: "approved", approvedAt: new Date().toISOString() });

      // Fire async processing — fetches deals, builds full breakdown for Evan, DMs each rep
      const token = interaction.token as string;
      processApproval(week, token, bounds).catch(e => console.error("Approval processing error:", e));

      // Respond immediately with deferred ephemeral so Discord doesn't time out
      return Response.json({ type: 5, data: { flags: 64 } });
    }

    // ── /decline ─────────────────────────────────────────────────────────
    if (command === "decline") {
      const weekId  = getWeekId();
      const weekKey = `sns:payouts:weekly:${weekId}`;
      const week    = await kv.get<WeeklyPayout>(weekKey);

      if (!week?.dealIds?.length) {
        return ephemeral("📭 No payout batch found for this week.");
      }

      await kv.set(weekKey, { ...week, status: "pending" });

      return ephemeral(
        `🔴 **Payout batch declined.** No payouts going out this week.\nBatch is held — run \`/approve\` when ready.`
      );
    }

    // Any other command — silent ignore
    return new Response(null, { status: 204 });
  }

  return new Response("Unhandled interaction type", { status: 400 });
}
