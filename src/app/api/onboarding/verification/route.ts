import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { updateContact } from "@/lib/ghl";
import { triggerEmail } from "@/lib/email";
import { triggerScenario } from "@/lib/make";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  const { email, action, notes } = await req.json() as {
    email: string;
    action: "approve" | "reject";
    notes?: string;
  };

  if (!email || !action) return new Response("Missing fields", { status: 400 });

  const clientKey = `sns:coaching:client:${email}`;
  const client = await kv.get<Record<string, unknown>>(clientKey);
  if (!client) return new Response("Client not found", { status: 404 });

  const ghlContactId = client.ghlContactId as string;

  const clientEmail = client.email as string;
  const clientName = client.name as string;

  if (action === "approve") {
    if (ghlContactId) {
      await updateContact(ghlContactId, {
        customField: [{ id: "id_verification_status", value: "approved" }],
      }).catch(e => console.error("GHL updateContact (approve):", e));
    }
    await kv.set(clientKey, { ...client, idVerification: "approved", status: "id_verified" });
    triggerEmail("approval", clientEmail, clientName).catch(console.error);
    triggerScenario("MAKE_VERIFICATION_WEBHOOK_URL", {
      email:            clientEmail,
      name:             clientName,
      status:           "approved",
      reason:           null,
      discordChannelId: (client.discordChannel as Record<string, string> | undefined)?.channelId ?? null,
      driveFolderUrl:   (client.driveFolder as Record<string, string> | undefined)?.url ?? null,
      timestamp:        new Date().toISOString(),
    }).catch(() => {});

    // Generate a fresh OAuth state token (original expires in 24h; approval may come later)
    const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
    const APP_URL   = process.env.NEXTAUTH_URL ?? "https://stack-n-scale.vercel.app";
    if (CLIENT_ID) {
      const discordRecord = await kv.get<{ channelId?: string }>(
        `sns:onboarding:discord:${clientEmail.toLowerCase()}`
      );
      if (discordRecord?.channelId) {
        const stateToken = crypto.randomUUID();
        await kv.set(`sns:oauth:state:${stateToken}`, clientEmail.toLowerCase(), { ex: 60 * 60 * 24 * 7 }); // 7-day TTL
        const params = new URLSearchParams({
          client_id: CLIENT_ID,
          redirect_uri: `${APP_URL}/api/discord/connect`,
          response_type: "code",
          scope: "identify guilds.join",
          state: stateToken,
        });
        const freshOAuthUrl = `https://discord.com/oauth2/authorize?${params}`;
        // Update KV so future re-approvals also get a fresh URL
        await kv.set(`sns:onboarding:discord:${clientEmail.toLowerCase()}`, {
          ...discordRecord,
          discordOAuthUrl: freshOAuthUrl,
        });
        triggerEmail("discord_link", clientEmail, clientName, {
          discordOAuthUrl: freshOAuthUrl,
        }).catch(console.error);
      }
    }

    return Response.json({ ok: true, action: "approved" });
  }

  if (action === "reject") {
    if (ghlContactId) {
      await updateContact(ghlContactId, {
        customField: [
          { id: "id_verification_status", value: "rejected" },
          { id: "id_rejection_reason", value: notes ?? "" },
        ],
      }).catch(e => console.error("GHL updateContact (reject):", e));
    }
    await kv.set(clientKey, {
      ...client,
      idVerification: "rejected",
      status: "id_pending",
      rejectionReason: notes,
    });
    triggerEmail("rejection", clientEmail, clientName, { reason: notes ?? "" }).catch(console.error);
    triggerScenario("MAKE_VERIFICATION_WEBHOOK_URL", {
      email:            clientEmail,
      name:             clientName,
      status:           "rejected",
      reason:           notes ?? null,
      discordChannelId: (client.discordChannel as Record<string, string> | undefined)?.channelId ?? null,
      driveFolderUrl:   (client.driveFolder as Record<string, string> | undefined)?.url ?? null,
      timestamp:        new Date().toISOString(),
    }).catch(() => {});
    return Response.json({ ok: true, action: "rejected" });
  }

  return new Response("Invalid action", { status: 400 });
}
