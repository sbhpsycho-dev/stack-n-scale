import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { webhookUrl, sendChannelMessage } from "@/lib/discord";

export const runtime = "nodejs";

const BOILER_ROOM_CHANNEL_ID = "1497034366335979662";

const CHANNELS = [
  { label: "New Leads",           envKey: "DISCORD_WEBHOOK_NEW_LEADS",     emoji: "🎯" },
  { label: "Appointments",        envKey: "DISCORD_WEBHOOK_APPOINTMENTS",  emoji: "📅" },
  { label: "Sales",               envKey: "DISCORD_WEBHOOK_SALES",         emoji: "🔥" },
  { label: "Alerts",              envKey: "DISCORD_WEBHOOK_ALERTS",        emoji: "🚨" },
  { label: "Daily Summary",       envKey: "DISCORD_WEBHOOK_DAILY_SUMMARY", emoji: "📊" },
  { label: "Deals",               envKey: "DISCORD_WEBHOOK_DEAL_CLOSED",   emoji: "💰" },
  { label: "Payments",            envKey: "DISCORD_WEBHOOK_PAYMENT",       emoji: "💳" },
  { label: "New Clients",         envKey: "DISCORD_WEBHOOK_NEW_CLIENT",    emoji: "🎉" },
  { label: "Check-ins",           envKey: "DISCORD_WEBHOOK_CHECKIN_ALERT", emoji: "✅" },
  { label: "Rep Updates",         envKey: "DISCORD_WEBHOOK_REP_UPDATES",   emoji: "📈" },
];

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  const now = new Date().toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });

  const results: Array<{
    label: string;
    envKey: string;
    hasUrl: boolean;
    sent: boolean;
    error?: string;
  }> = [];

  // Test each webhook channel
  for (const ch of CHANNELS) {
    const url = await webhookUrl(ch.envKey);
    if (!url) {
      results.push({ label: ch.label, envKey: ch.envKey, hasUrl: false, sent: false });
      continue;
    }

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embeds: [{
            title: `${ch.emoji} Test — ${ch.label}`,
            color: 0xFF6B00,
            description: `This is a test notification for the **${ch.label}** channel.\nAll systems go — this channel is wired correctly.`,
            footer: { text: "SNS Notification Test" },
            timestamp: new Date().toISOString(),
          }],
          content: `🧪 **Discord test fired at ${now}**`,
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok || res.status === 204) {
        results.push({ label: ch.label, envKey: ch.envKey, hasUrl: true, sent: true });
      } else {
        const body = await res.text().catch(() => "");
        results.push({ label: ch.label, envKey: ch.envKey, hasUrl: true, sent: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` });
      }
    } catch (err) {
      results.push({ label: ch.label, envKey: ch.envKey, hasUrl: true, sent: false, error: String(err) });
    }
  }

  // Test the boiler room bot message (daily summary channel)
  let boilerRoomResult: { sent: boolean; error?: string } = { sent: false };
  try {
    await sendChannelMessage(
      BOILER_ROOM_CHANNEL_ID,
      `🧪 **Boiler Room Bot Test — ${now}**\nThis is a test from the SNS notification system. Bot token and channel access are confirmed.`
    );
    boilerRoomResult = { sent: true };
  } catch (err) {
    boilerRoomResult = { sent: false, error: String(err) };
  }

  const sentCount  = results.filter(r => r.sent).length;
  const noUrlCount = results.filter(r => !r.hasUrl).length;
  const failCount  = results.filter(r => r.hasUrl && !r.sent).length;

  return Response.json({
    ok: true,
    summary: { sent: sentCount, noUrl: noUrlCount, failed: failCount, total: results.length },
    channels: results,
    boilerRoom: boilerRoomResult,
    testedAt: new Date().toISOString(),
  });
}
