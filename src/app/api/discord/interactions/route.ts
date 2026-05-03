import { kv } from "@vercel/kv";
import type { WeeklyPayout } from "@/lib/deal-types";
import { getWeekId, getWeekBounds } from "@/lib/payout-calc";

const EVAN_USER_ID = process.env.EVAN_DISCORD_USER_ID!;
const PUBLIC_KEY   = process.env.DISCORD_PUBLIC_KEY!;

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
      "raw",
      hexToBytes(PUBLIC_KEY),
      { name: "Ed25519" },
      false,
      ["verify"]
    );
    return await crypto.subtle.verify(
      "Ed25519",
      key,
      hexToBytes(signature),
      new TextEncoder().encode(timestamp + body)
    );
  } catch {
    return false;
  }
}

function fmt$(n: number) {
  return `$${(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function ephemeral(content: string) {
  return Response.json({ type: 4, data: { content, flags: 64 } });
}

function visible(content: string) {
  return Response.json({ type: 4, data: { content } });
}

export async function POST(req: Request) {
  const signature = req.headers.get("x-signature-ed25519") ?? "";
  const timestamp = req.headers.get("x-signature-timestamp") ?? "";
  const rawBody   = await req.text();

  const valid = await verifySignature(signature, timestamp, rawBody);
  if (!valid) return new Response("Invalid signature", { status: 401 });

  const interaction = JSON.parse(rawBody);

  // Discord PING — required for endpoint verification
  if (interaction.type === 1) {
    return Response.json({ type: 1 });
  }

  // Slash command
  if (interaction.type === 2) {
    const userId  = interaction.member?.user?.id ?? interaction.user?.id;
    const command = interaction.data?.name as string;

    if (userId !== EVAN_USER_ID) {
      return ephemeral("❌ Only Evan can use this command.");
    }

    // ── /approve ──────────────────────────────────────────────────────────
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

      const updated: WeeklyPayout = {
        ...week,
        status:     "approved",
        approvedAt: new Date().toISOString(),
      };
      await kv.set(weekKey, updated);

      return visible(
        [
          `✅ **Payouts approved — week of ${bounds.start}**`,
          ``,
          `💰 Gross: ${fmt$(week.totals?.gross ?? 0)}`,
          `📤 Total Payouts: ${fmt$(week.totals?.totalPayouts ?? 0)}`,
          `🟢 Evan Take Home: ${fmt$(week.totals?.evanTakeHome ?? 0)}`,
          `📦 Deals: ${week.dealIds.length}`,
        ].join("\n")
      );
    }

    // ── /decline ──────────────────────────────────────────────────────────
    if (command === "decline") {
      const weekId  = getWeekId();
      const weekKey = `sns:payouts:weekly:${weekId}`;
      const week    = await kv.get<WeeklyPayout>(weekKey);

      if (!week?.dealIds?.length) {
        return ephemeral("📭 No payout batch found for this week.");
      }

      // Keep status as pending — batch stays held
      const updated: WeeklyPayout = { ...week, status: "pending" };
      await kv.set(weekKey, updated);

      return visible(
        `🔴 **Payout batch declined.** No payouts going out this week.\nBatch is held — run \`/approve\` when ready.`
      );
    }

    return ephemeral("Unknown command. Use `/approve` or `/decline`.");
  }

  return new Response("Unhandled interaction type", { status: 400 });
}
