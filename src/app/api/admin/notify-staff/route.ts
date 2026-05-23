import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sendDiscordDM } from "@/lib/discord";

const SETTERS = [
  { name: "Kian",   discordId: process.env.DISCORD_REP_ID_KIAN    ?? "" },
  { name: "Elias",  discordId: process.env.DISCORD_REP_ID_ELIAS   ?? "" },
  { name: "Naomi",  discordId: process.env.DISCORD_REP_ID_NAOMI   ?? "" },
  { name: "Callum", discordId: process.env.DISCORD_REP_ID_CALLUM  ?? "" },
  { name: "Taha",   discordId: process.env.DISCORD_REP_ID_TAHA    ?? "" },
].filter(s => s.discordId.length > 0);

const APP_URL = process.env.NEXTAUTH_URL ?? "https://stack-n-scale.vercel.app";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  const results = await Promise.allSettled(
    SETTERS.map(({ name, discordId }) =>
      sendDiscordDM(
        discordId,
        `Hey ${name}! 👋\n\nYour Stack N Scale staff dashboard is ready.\n\n🔗 **Login:** ${APP_URL}/login\n\nUse the password your admin provided. Log in, go to Settings to change it, then start logging your daily numbers. Lmk if you have any issues.`
      )
    )
  );

  const summary = SETTERS.map((s, i) => ({
    name: s.name,
    ok: results[i].status === "fulfilled",
    error: results[i].status === "rejected" ? (results[i] as PromiseRejectedResult).reason?.message : undefined,
  }));

  return Response.json({ ok: true, results: summary });
}
