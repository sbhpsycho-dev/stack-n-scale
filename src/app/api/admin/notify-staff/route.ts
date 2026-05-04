import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sendDiscordDM } from "@/lib/discord";

const SETTERS = [
  { name: "Kian",  discordId: "1485467469014634547", password: "kian2026"  },
  { name: "Elias", discordId: "392810193194582017",  password: "elias2026" },
  { name: "Kolen", discordId: "1306377540746739743", password: "kolen2026" },
];

const APP_URL = "https://stack-n-scale.vercel.app";

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  const bypassOk = process.env.NEXTAUTH_SECRET && authHeader === `Bearer ${process.env.NEXTAUTH_SECRET}`;
  if (!bypassOk) {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "admin") {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const results = await Promise.allSettled(
    SETTERS.map(({ name, discordId, password }) =>
      sendDiscordDM(
        discordId,
        `Hey ${name}! 👋\n\nYour Stack N Scale staff dashboard is ready.\n\n🔗 **Login:** ${APP_URL}/login\n🔑 **Password:** \`${password}\`\n\nLog in, change your password in settings, and start logging your daily numbers. Lmk if you have any issues.`
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
