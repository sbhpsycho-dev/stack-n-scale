import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const COMMANDS = [
  {
    name:        "approve",
    description: "Approve this week's payout batch",
    type:        1,
  },
  {
    name:        "decline",
    description: "Decline this week's payout batch (holds payouts)",
    type:        1,
  },
];

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return Response.json({ error: "DISCORD_BOT_TOKEN not set" }, { status: 500 });

  // Get app ID from the bot token
  const meRes = await fetch("https://discord.com/api/v10/applications/@me", {
    headers: { Authorization: `Bot ${token}` },
  });
  if (!meRes.ok) return Response.json({ error: "Failed to fetch app info" }, { status: 500 });
  const app = await meRes.json();
  const appId: string = app.id;

  // Register global slash commands
  const res = await fetch(`https://discord.com/api/v10/applications/${appId}/commands`, {
    method:  "PUT",
    headers: {
      Authorization:  `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(COMMANDS),
  });

  if (!res.ok) {
    const err = await res.text();
    return Response.json({ error: "Discord registration failed", detail: err }, { status: 500 });
  }

  return Response.json({ ok: true, appId, commands: COMMANDS.map(c => c.name) });
}
