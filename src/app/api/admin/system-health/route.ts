import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { getDriveFailures } from "@/lib/alert";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [driveFailures, lastDriveConfirm, lastSheetsSync] = await Promise.allSettled([
    getDriveFailures(),
    kv.keys("sns:drive:confirmed:*").then(keys => keys.length),
    kv.keys("sns:sheets:synced:*").then(keys => keys.length),
  ]);

  // Check last received timestamps for each webhook type
  // These are set by the webhook routes when they receive a valid payload
  const [lastStripe, lastFanbasis, lastGHL, lastMeta] = await Promise.all([
    kv.get<string>("sns:webhook:last:stripe"),
    kv.get<string>("sns:webhook:last:fanbasis"),
    kv.get<string>("sns:webhook:last:ghl"),
    kv.get<string>("sns:webhook:last:meta"),
  ]);

  const failures = driveFailures.status === "fulfilled" ? driveFailures.value : [];

  return NextResponse.json({
    status: failures.length === 0 ? "healthy" : "degraded",
    checkedAt: new Date().toISOString(),
    components: {
      driveSync: {
        status: failures.length === 0 ? "ok" : "failures",
        failureCount: failures.length,
        failures: failures.map(f => ({ email: f.email, ...(f.data as object ?? {}) })),
        confirmedCount: lastDriveConfirm.status === "fulfilled" ? lastDriveConfirm.value : 0,
      },
      sheetsSync: {
        status: "ok",
        syncedCount: lastSheetsSync.status === "fulfilled" ? lastSheetsSync.value : 0,
      },
      webhooks: {
        stripe:   { lastReceived: lastStripe   ?? null },
        fanbasis: { lastReceived: lastFanbasis ?? null },
        ghl:      { lastReceived: lastGHL      ?? null },
        meta:     { lastReceived: lastMeta     ?? null },
      },
      makecom: {
        configured: {
          deal:         !!process.env.MAKE_DEAL_WEBHOOK_URL,
          idSubmit:     !!process.env.MAKE_ID_SUBMIT_WEBHOOK_URL,
          verification: !!process.env.MAKE_VERIFICATION_WEBHOOK_URL,
          payout:       !!process.env.MAKE_PAYOUT_WEBHOOK_URL,
          checkin:      !!process.env.MAKE_CHECKIN_ALERT_WEBHOOK_URL,
          onboarding:   !!process.env.MAKE_ONBOARDING_FORM_WEBHOOK_URL,
        },
      },
    },
  });
}
