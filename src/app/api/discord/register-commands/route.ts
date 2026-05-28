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
  {
    name:        "new-client",
    description: "Register a new client after payment is received",
    type:        1,
    options: [
      { name: "name",    type: 3, description: "Client full name",          required: true },
      { name: "email",   type: 3, description: "Client email address",      required: true },
      { name: "amount",  type: 4, description: "Payment amount in dollars", required: true },
      {
        name:        "program",
        type:        3,
        description: "Program tier",
        required:    true,
        choices: [
          { name: "Standard ($5,000)", value: "standard" },
          { name: "VIP ($10,000)",     value: "vip"      },
        ],
      },
    ],
  },
  {
    name:        "log-deal",
    description: "Log a new deal",
    type:        1,
    options: [
      { name: "client",  description: "Client full name",                              type: 3,  required: true },
      { name: "amount",  description: "Gross amount in dollars (e.g. 5000)",           type: 10, required: true },
      {
        name:        "offer",
        description: "Offer tier",
        type:        3,
        required:    true,
        choices: [
          { name: "5K",  value: "5K"  },
          { name: "10K", value: "10K" },
        ],
      },
      { name: "setter",  description: "Setter first name (leave blank if none)",       type: 3,  required: false },
      { name: "closer",  description: "Closer first name (leave blank if none)",       type: 3,  required: false },
      {
        name:        "source",
        description: "Lead source",
        type:        3,
        required:    false,
        choices: [
          { name: "Ad",      value: "ad"      },
          { name: "Organic", value: "organic" },
        ],
      },
    ],
  },
  {
    name:        "my-stats",
    description: "See your KPIs for the current week",
    type:        1,
    options:     [],
  },
  {
    name:        "client-status",
    description: "Check onboarding status for a client",
    type:        1,
    options: [
      { name: "email", description: "Client email address", type: 3, required: true },
    ],
  },
  {
    name:        "pending-payouts",
    description: "List deals waiting for payout approval",
    type:        1,
    options:     [],
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
