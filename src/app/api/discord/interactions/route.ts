import { kv } from "@vercel/kv";
import type { WeeklyPayout, Deal } from "@/lib/deal-types";
import { getWeekId, getWeekBounds } from "@/lib/payout-calc";
import { triggerOnboarding } from "@/lib/onboarding";
import { getStaffDiscordId } from "@/lib/staff-registry";

const EVAN_USER_ID = process.env.EVAN_DISCORD_USER_ID!;
const PUBLIC_KEY   = process.env.DISCORD_PUBLIC_KEY!;
const BOT_TOKEN    = process.env.DISCORD_BOT_TOKEN!;
const APP_ID       = process.env.DISCORD_CLIENT_ID!;

// rep first name (lowercase) → Discord user ID
// Resolved from staff registry first; falls back to env var for transition period
async function getRepDiscordId(key: string): Promise<string | null> {
  return (
    (await getStaffDiscordId(key))
    ?? process.env[`DISCORD_REP_ID_${key.toUpperCase()}`]
    ?? null
  );
}

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

function getOptionValue(options: Array<{ name: string; value: unknown }>, name: string): unknown {
  return options?.find((o) => o.name === name)?.value ?? null;
}

function getWeekStart(): Date {
  const now  = new Date();
  const day  = now.getDay(); // 0 = Sunday
  const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const monday = new Date(now.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
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
      const discordId = await getRepDiscordId(rep.key);
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

    // ── /log-deal ─────────────────────────────────────────────────────────
    if (command === "log-deal") {
      const options = (interaction.data?.options ?? []) as Array<{ name: string; value: unknown }>;

      const clientName  = getOptionValue(options, "client")  as string;
      const grossAmount = getOptionValue(options, "amount")   as number;
      const offer       = (getOptionValue(options, "offer")   as string  | null) ?? "5K";
      const setterName  = (getOptionValue(options, "setter")  as string  | null) ?? null;
      const closerName  = (getOptionValue(options, "closer")  as string  | null) ?? null;
      const leadSource  = (getOptionValue(options, "source")  as string  | null) ?? "organic";

      const registry = await kv.get<any[]>("sns-staff-registry") ?? [];
      const actor    = registry.find(s => s.discordId === userId);

      const processorFee = Math.round(grossAmount * 0.03);
      const netAmount    = grossAmount - processorFee;

      const dealRes = await fetch(`${process.env.NEXTAUTH_URL}/api/deals`, {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${process.env.CRON_SECRET}`,
        },
        body: JSON.stringify({
          date:         new Date().toISOString(),
          clientName,
          offer,
          grossAmount,
          processorFee,
          netAmount,
          leadSource,
          processor:    "stripe",
          setter:       setterName,
          closer:       closerName,
          dmSetter:     null,
          notes:        `Logged via Discord by ${actor?.name ?? userId}`,
        }),
      });

      if (!dealRes.ok) {
        return ephemeral("❌ Failed to log deal. Check your inputs and try again.");
      }

      const deal = await dealRes.json();
      return Response.json({
        type: 4,
        data: {
          embeds: [{
            title:  "✅ Deal Logged",
            color:  0x22c55e,
            fields: [
              { name: "Client", value: clientName,                           inline: true },
              { name: "Offer",  value: offer,                                inline: true },
              { name: "Gross",  value: `$${grossAmount.toLocaleString()}`,   inline: true },
              { name: "Setter", value: setterName ?? "—",                    inline: true },
              { name: "Closer", value: closerName ?? "—",                    inline: true },
              { name: "Source", value: leadSource,                           inline: true },
            ],
            footer:    { text: `Deal ID: ${deal.id ?? "pending"}` },
            timestamp: new Date().toISOString(),
          }],
        },
      });
    }

    // ── /my-stats ─────────────────────────────────────────────────────────
    if (command === "my-stats") {
      const registry = await kv.get<any[]>("sns-staff-registry") ?? [];
      const staff    = registry.find(s => s.discordId === userId);

      if (!staff) {
        return ephemeral(
          "❌ Your Discord ID isn't linked to a staff account yet. Ask an admin to run the staff migration or update your profile."
        );
      }

      const weekStart = getWeekStart();
      const dealIds   = await kv.lrange("sns:deals:index", 0, -1);
      const deals     = (
        await Promise.all(dealIds.map(id => kv.get<any>(`sns:deals:${id}`)))
      ).filter(Boolean);

      const firstName = staff.name.split(" ")[0].toLowerCase();
      const weekDeals = deals.filter(d => {
        if (!d) return false;
        const dealDate = new Date(d.date);
        return (
          dealDate >= weekStart &&
          (
            d.setter?.toLowerCase().startsWith(firstName)  ||
            d.closer?.toLowerCase().startsWith(firstName)  ||
            d.setterId === staff.discordId                  ||
            d.closerId === staff.discordId
          )
        );
      });

      const weekGMV   = weekDeals.reduce((sum, d) => sum + (d?.grossAmount ?? 0), 0);
      const weekCount = weekDeals.length;

      return Response.json({
        type: 4,
        data: {
          embeds: [{
            title:  `📊 ${staff.name}'s Stats — This Week`,
            color:  0xf97316,
            fields: [
              { name: "Deals", value: String(weekCount),                  inline: true },
              { name: "GMV",   value: `$${weekGMV.toLocaleString()}`,     inline: true },
              { name: "Role",  value: staff.role ?? "setter",             inline: true },
            ],
            timestamp: new Date().toISOString(),
          }],
          flags: 64,
        },
      });
    }

    // ── /client-status ────────────────────────────────────────────────────
    if (command === "client-status") {
      const opts            = (interaction.data?.options ?? []) as Array<{ name: string; value: unknown }>;
      const email           = getOptionValue(opts, "email") as string;

      if (!email) return ephemeral("❌ Email is required.");

      const normalizedEmail = email.toLowerCase().trim();
      const client          = await kv.get<any>(`sns:coaching:client:${normalizedEmail}`);

      if (!client) return ephemeral(`❌ No client found for \`${email}\``);

      const statusEmojis: Record<string, string> = {
        payment_received:    "💳",
        id_pending:          "⏳",
        id_pending_review:   "🔍",
        id_verified:         "✅",
        onboarding_form_sent:"📝",
        onboarding_complete: "🎉",
        coach_assigned:      "👤",
        kickoff_booked:      "📅",
        active:              "🟢",
        alumni:              "🏆",
      };

      return Response.json({
        type: 4,
        data: {
          embeds: [{
            title:  `${statusEmojis[client.status] ?? "❓"} ${client.name}`,
            color:  0x3b82f6,
            fields: [
              { name: "Status",          value: client.status?.replace(/_/g, " ") ?? "unknown", inline: true },
              { name: "Coach",           value: client.coachAssigned ?? "Unassigned",            inline: true },
              { name: "ID Verification", value: client.idVerification ?? "pending",              inline: true },
              { name: "Email",           value: email,                                           inline: false },
            ],
            timestamp: new Date().toISOString(),
          }],
          flags: 64,
        },
      });
    }

    // ── /pending-payouts ──────────────────────────────────────────────────
    if (command === "pending-payouts") {
      const pendingIds = await kv.lrange("sns:payouts:pending", 0, -1);

      if (!pendingIds.length) return ephemeral("✅ No pending payouts.");

      const deals = (
        await Promise.all(pendingIds.slice(0, 10).map(id => kv.get<any>(`sns:deals:${id}`)))
      ).filter(Boolean);

      const lines = deals
        .map(d => `• **${d.clientName}** — $${d.grossAmount?.toLocaleString()} (${d.offer}) — ${d.setter ?? "no setter"}`)
        .join("\n");

      return Response.json({
        type: 4,
        data: {
          embeds: [{
            title:       `⏳ Pending Payouts (${pendingIds.length})`,
            description: lines + (pendingIds.length > 10 ? `\n_...and ${pendingIds.length - 10} more_` : ""),
            color:       0xeab308,
            timestamp:   new Date().toISOString(),
          }],
          flags: 64,
        },
      });
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
