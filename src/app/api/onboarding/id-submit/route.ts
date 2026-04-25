import { kv } from "@vercel/kv";
import type { CoachingClient } from "@/lib/coaching-types";

const DISCORD_API = "https://discord.com/api/v10";
const BOT_TOKEN   = process.env.DISCORD_BOT_TOKEN ?? "";
const GUILD_ID    = process.env.DISCORD_GUILD_ID ?? "";
const CAELUM_ID   = process.env.DISCORD_CAELUM_USER_ID ?? "";

async function getOrCreateDmChannel(): Promise<string> {
  const res = await fetch(`${DISCORD_API}/users/@me/channels`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ recipient_id: CAELUM_ID }),
  });
  if (!res.ok) throw new Error(`DM channel create failed: ${await res.text()}`);
  const data = await res.json() as { id: string };
  return data.id;
}

async function getClientChannel(firstName: string): Promise<string | null> {
  if (!GUILD_ID) return null;
  const res = await fetch(`${DISCORD_API}/guilds/${GUILD_ID}/channels`, {
    headers: { Authorization: `Bot ${BOT_TOKEN}` },
  });
  if (!res.ok) return null;
  const channels = await res.json() as { id: string; name: string }[];
  const match = channels.find(c => c.name === `client-${firstName}`);
  return match?.id ?? null;
}

function base64ToArrayBuffer(dataUrl: string): ArrayBuffer {
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
  const binary = atob(base64);
  const ab = new ArrayBuffer(binary.length);
  const view = new Uint8Array(ab);
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
  return ab;
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const name      = (formData.get("name") as string | null)?.trim() ?? "";
    const email     = (formData.get("email") as string | null)?.trim().toLowerCase() ?? "";
    const idFront   = formData.get("idFront") as File | null;
    const selfie    = formData.get("selfie") as File | null;
    const signature = formData.get("signature") as string | null;

    if (!name || !email || !idFront || !selfie) {
      return Response.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    // Update KV — mark idVerification as submitted
    const clientKey = `sns:coaching:client:${email}`;
    const existing  = await kv.get<CoachingClient>(clientKey);
    if (existing) {
      await kv.set(clientKey, {
        ...existing,
        idVerification: "submitted",
        status: "id_pending_review",
      });
    }

    // Store submission record
    await kv.set(`sns:onboarding:id-submit:${email}`, {
      name, email,
      submittedAt: new Date().toISOString(),
      consentGiven: true,
      hasSig: !!signature,
    });

    // Post to Discord
    if (BOT_TOKEN && CAELUM_ID) {
      try {
        const firstName = name.split(" ")[0].toLowerCase().replace(/[^a-z0-9]/g, "");

        let channelId = await getClientChannel(firstName).catch(() => null);
        if (!channelId) channelId = await getOrCreateDmChannel();

        const caption = [
          `🪪 **ID Verification Submitted — ${name}**`,
          `📧 ${email}`,
          `✅ Consent confirmed · Signature attached`,
          ``,
          `Attached: government ID (front) + selfie holding ID + signature.`,
        ].join("\n");

        const body = new FormData();
        body.append("content", caption);
        body.append("files[0]", new Blob([await idFront.arrayBuffer()], { type: idFront.type }), idFront.name || "id-front.jpg");
        body.append("files[1]", new Blob([await selfie.arrayBuffer()], { type: selfie.type }), selfie.name || "selfie.jpg");

        if (signature) {
          const sigAb = base64ToArrayBuffer(signature);
          body.append("files[2]", new Blob([sigAb], { type: "image/png" }), "signature.png");
        }

        await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
          method: "POST",
          headers: { Authorization: `Bot ${BOT_TOKEN}` },
          body,
        });
      } catch (discordErr) {
        console.error("Discord error:", discordErr);
      }
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("ID submit error:", err);
    return Response.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
