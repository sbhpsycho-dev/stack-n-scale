import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { type StudentChannel, type DiscordMessage } from "@/lib/staff-types";
import { type CoachingClient } from "@/lib/coaching-types";

const DISCORD_API = "https://discord.com/api/v10";
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN ?? "";

async function discordFetch(path: string, init?: RequestInit) {
  return fetch(`${DISCORD_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin" && session.user.role !== "staff") {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(req.url);
  const channelId = url.searchParams.get("channelId");

  // List all student channels
  if (!channelId) {
    const discordKeys = await kv.keys("sns:onboarding:discord:*");
    const clientKeys = await kv.keys("sns:coaching:client:*");

    const [discordEntries, clients] = await Promise.all([
      Promise.all(discordKeys.map(async (k) => {
        const email = k.replace("sns:onboarding:discord:", "");
        const data = await kv.get<{ channelId: string }>(k);
        return data ? { email, channelId: data.channelId } : null;
      })),
      Promise.all(clientKeys.map((k) => kv.get<CoachingClient>(k))),
    ]);

    const clientMap = new Map(
      clients.filter((c): c is CoachingClient => c !== null).map((c) => [c.email, c.name])
    );

    const channels: StudentChannel[] = [];
    for (const entry of discordEntries) {
      if (!entry) continue;
      const res = await discordFetch(`/channels/${entry.channelId}`);
      const channelData = res.ok ? await res.json() as { name?: string } : null;
      channels.push({
        email: entry.email,
        channelId: entry.channelId,
        channelName: channelData?.name ?? entry.channelId,
        studentName: clientMap.get(entry.email) ?? entry.email,
      });
    }

    return Response.json(channels);
  }

  // Fetch messages for a specific channel
  const res = await discordFetch(`/channels/${channelId}/messages?limit=50`);
  if (!res.ok) return Response.json([]);

  const raw = await res.json() as Array<{
    id: string;
    content: string;
    author: { username: string; avatar?: string; id: string };
    timestamp: string;
  }>;

  const messages: DiscordMessage[] = raw.reverse().map((m) => ({
    id: m.id,
    content: m.content,
    author: m.author.username,
    authorAvatar: m.author.avatar
      ? `https://cdn.discordapp.com/avatars/${m.author.id}/${m.author.avatar}.png`
      : undefined,
    timestamp: m.timestamp,
  }));

  return Response.json(messages);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin" && session.user.role !== "staff") {
    return new Response("Unauthorized", { status: 401 });
  }

  const { channelId, content } = await req.json() as { channelId: string; content: string };
  if (!channelId || !content?.trim()) {
    return Response.json({ ok: false, error: "channelId and content required" }, { status: 400 });
  }

  const res = await discordFetch(`/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content: content.trim() }),
  });

  if (!res.ok) {
    const err = await res.text();
    return Response.json({ ok: false, error: err }, { status: 500 });
  }

  return Response.json({ ok: true });
}
