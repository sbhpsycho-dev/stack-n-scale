import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { sendChannelMessage } from "@/lib/discord";
import { verifyCronSecret } from "@/lib/cron-auth";
import { type CoachingClient } from "@/lib/coaching-types";

const CHECKIN_URL = "https://stack-n-scale.vercel.app/checkin";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const isCron = verifyCronSecret(req.headers.get("authorization"));

  if (!isCron && (!session || (session.user.role !== "admin" && session.user.role !== "staff"))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const keys = await kv.keys("sns:coaching:client:*");
  const clients: CoachingClient[] = keys.length
    ? (await Promise.all(keys.map(k => kv.get<CoachingClient>(k)))).filter((c): c is CoachingClient => c !== null)
    : [];

  const eligible = clients.filter(
    c => c.status === "active" || c.status === "kickoff_booked"
  );

  let sent = 0;
  let skipped = 0;

  await Promise.all(
    eligible.map(async client => {
      const record = await kv.get<{ channelId: string; channelName: string }>(
        `sns:onboarding:discord:${client.email}`
      );

      if (!record?.channelId) {
        skipped++;
        return;
      }

      const firstName = client.name.split(" ")[0];
      const message = [
        `Hey ${firstName} 👋 It's that time — drop your weekly check-in when you get a sec:`,
        CHECKIN_URL,
        "",
        `Takes less than 5 min. Let us know how the week went 💪`,
      ].join("\n");

      try {
        await sendChannelMessage(record.channelId, message);
        sent++;
      } catch {
        skipped++;
      }
    })
  );

  return Response.json({
    ok: true,
    sent,
    skipped,
    total: eligible.length,
  });
}
