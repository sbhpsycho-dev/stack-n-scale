const DISCORD_API = "https://discord.com/api/v10";

export async function sendChannelMessage(
  channelId: string,
  content: string,
  embed?: object
): Promise<void> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token || !channelId) return;
  await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(embed ? { content, embeds: [embed] } : { content }),
    signal: AbortSignal.timeout(8000),
  });
}

export async function sendDiscordDM(userId: string, content: string): Promise<void> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token || !userId) return;

  const ch = await fetch(`${DISCORD_API}/users/@me/channels`, {
    method: "POST",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipient_id: userId }),
    signal: AbortSignal.timeout(8000),
  });
  if (!ch.ok) return;
  const { id: channelId } = await ch.json() as { id: string };

  await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
    signal: AbortSignal.timeout(8000),
  });
}
