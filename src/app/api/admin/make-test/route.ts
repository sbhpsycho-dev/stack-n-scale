import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

interface WebhookEntry {
  scenario: string;
  envVar: string;
  samplePayload: Record<string, unknown>;
}

// Representative sample payloads — clearly marked as test data so Make.com scenarios can filter them
const WEBHOOK_ENTRIES: WebhookEntry[] = [
  {
    scenario: "Deal Closed → Sheets",
    envVar: "MAKE_DEAL_WEBHOOK_URL",
    samplePayload: {
      _test: true,
      id: "test-deal-sns-001",
      date: new Date().toISOString().split("T")[0],
      clientName: "Test Client SNS",
      offer: "5K",
      grossAmount: 5000,
      netAmount: 4750,
      leadSource: "organic",
      processor: "stripe",
      dmSetter: null,
      setter: "Kian",
      closer: null,
      payouts: {
        dmSetter: 0,
        setter: 500,
        closer: 0,
        caelum: 712,
        totalPayouts: 1212,
        companyReinvestment: 354,
        evanTakeHome: 3184,
      },
      payoutStatus: "pending",
      notes: "Test payload from SNS admin",
    },
  },
  {
    scenario: "Onboarding Form",
    envVar: "MAKE_ONBOARDING_FORM_WEBHOOK_URL",
    samplePayload: {
      _test: true,
      email: "test-client@sns-test.com",
      name: "Test Client SNS",
      phone: "+15555550100",
      responses: {
        current_income: "$0 — getting started",
        goal: "Hit $10k/month in 90 days",
        commitment_hours: "40+ hours/week",
      },
      submittedAt: new Date().toISOString(),
      driveFolderUrl: null,
      ghlContactId: null,
    },
  },
  {
    scenario: "ID Verification Submitted",
    envVar: "MAKE_ID_SUBMIT_WEBHOOK_URL",
    samplePayload: {
      _test: true,
      email: "test-client@sns-test.com",
      name: "Test Client SNS",
      idFrontUrl: "https://example.com/test-id-front.jpg",
      idBackUrl: null,
      selfieUrl: "https://example.com/test-selfie.jpg",
      driveFolderId: null,
      ghlContactId: null,
      submittedAt: new Date().toISOString(),
    },
  },
  {
    scenario: "ID Verification Decision",
    envVar: "MAKE_VERIFICATION_WEBHOOK_URL",
    samplePayload: {
      _test: true,
      email: "test-client@sns-test.com",
      name: "Test Client SNS",
      status: "approved",
      reason: null,
      discordChannelId: null,
      driveFolderUrl: null,
      timestamp: new Date().toISOString(),
    },
  },
  {
    scenario: "Weekly Payout",
    envVar: "MAKE_PAYOUT_WEBHOOK_URL",
    samplePayload: {
      _test: true,
      weekId: "test-week",
      weekStart: new Date().toISOString().split("T")[0],
      payouts: [
        {
          staffDiscordId: "747511465443065876",
          staffName: "Caelum",
          amount: 712,
          deals: [{ client: "Test Client", gross: 5000, cut: 712, ad: false }],
        },
      ],
      totalGMV: 5000,
      timestamp: new Date().toISOString(),
    },
  },
  {
    scenario: "New Lead",
    envVar: "MAKE_NEW_LEAD_WEBHOOK_URL",
    samplePayload: {
      _test: true,
      id: "test-lead-sns-001",
      name: "Test Lead SNS",
      email: "test-lead@sns-test.com",
      phone: "+15555550200",
      source: "meta",
      state: "new",
      assignedSetter: null,
      createdAt: new Date().toISOString(),
    },
  },
  {
    scenario: "Check-in Alert",
    envVar: "MAKE_CHECKIN_ALERT_WEBHOOK_URL",
    samplePayload: {
      _test: true,
      studentName: "Test Student SNS",
      coachDiscordId: "747511465443065876",
      score: 4,
      week: "Week 3",
      flags: ["missed training sessions", "needs accountability check-in"],
      severity: "red",
      timestamp: new Date().toISOString(),
    },
  },
  {
    scenario: "Staff Onboarding",
    envVar: "MAKE_STAFF_ONBOARDING_WEBHOOK_URL",
    samplePayload: {
      _test: true,
      staffId: "test-staff",
      name: "Test Staff SNS",
      email: "test-staff@sns-test.com",
      discordId: "747511465443065876",
      role: "setter",
      loginUrl: "https://stack-n-scale.vercel.app/login",
      timestamp: new Date().toISOString(),
    },
  },
  // ── Existing webhooks (no documented schema — use generic test ping) ──────
  {
    scenario: "Campaign",
    envVar: "MAKE_CAMPAIGN_WEBHOOK_URL",
    samplePayload: {
      _test: true,
      source: "sns-admin-test",
      timestamp: new Date().toISOString(),
    },
  },
  {
    scenario: "Drive Docs",
    envVar: "MAKE_DRIVE_DOCS_WEBHOOK_URL",
    samplePayload: {
      _test: true,
      source: "sns-admin-test",
      timestamp: new Date().toISOString(),
    },
  },
  {
    scenario: "Email",
    envVar: "MAKE_EMAIL_WEBHOOK_URL",
    samplePayload: {
      _test: true,
      source: "sns-admin-test",
      timestamp: new Date().toISOString(),
    },
  },
  {
    scenario: "Rep Log",
    envVar: "MAKE_REPLOG_WEBHOOK_URL",
    samplePayload: {
      _test: true,
      source: "sns-admin-test",
      timestamp: new Date().toISOString(),
    },
  },
  {
    scenario: "SMS",
    envVar: "MAKE_SMS_WEBHOOK_URL",
    samplePayload: {
      _test: true,
      source: "sns-admin-test",
      timestamp: new Date().toISOString(),
    },
  },
];

export async function POST(_req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  const results = await Promise.all(
    WEBHOOK_ENTRIES.map(async (entry) => {
      const webhookUrl = process.env[entry.envVar];

      if (!webhookUrl) {
        return {
          scenario:   entry.scenario,
          envVar:     entry.envVar,
          webhookUrl: null,
          status:     "not_configured" as const,
          httpStatus: null,
          latencyMs:  null,
        };
      }

      const start = Date.now();
      try {
        const res = await fetch(webhookUrl, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(entry.samplePayload),
          signal:  AbortSignal.timeout(10_000),
        });
        const latencyMs = Date.now() - start;
        const ok = res.status === 200 || res.status === 202 || res.status === 204;
        return {
          scenario:   entry.scenario,
          envVar:     entry.envVar,
          webhookUrl,
          status:     ok ? ("ok" as const) : ("error" as const),
          httpStatus: res.status,
          latencyMs,
        };
      } catch (err) {
        const latencyMs = Date.now() - start;
        const isTimeout =
          err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
        return {
          scenario:   entry.scenario,
          envVar:     entry.envVar,
          webhookUrl,
          status:     isTimeout ? ("timeout" as const) : ("error" as const),
          httpStatus: null,
          latencyMs,
          error:      err instanceof Error ? err.message : String(err),
        };
      }
    })
  );

  const summary = {
    ok:             results.filter(r => r.status === "ok").length,
    error:          results.filter(r => r.status === "error").length,
    timeout:        results.filter(r => r.status === "timeout").length,
    not_configured: results.filter(r => r.status === "not_configured").length,
  };

  return Response.json({ results, summary });
}
