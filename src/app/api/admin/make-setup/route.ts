import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createHook, createScenario } from "@/lib/make-admin";

interface ScenarioDef {
  name: string;
  envVar: string;
  description: string;
}

const SCENARIOS: ScenarioDef[] = [
  {
    name: "SNS — Deal Closed",
    envVar: "MAKE_DEAL_WEBHOOK_URL",
    description: "Fires when a deal is saved. Appends to Master Log + Setter KPI sheets, sends Discord notification.",
  },
  {
    name: "SNS — Onboarding Form",
    envVar: "MAKE_ONBOARDING_FORM_WEBHOOK_URL",
    description: "Fires when a client submits the onboarding form. Updates GHL, creates Drive doc, posts Discord alert.",
  },
  {
    name: "SNS — ID Verification Submitted",
    envVar: "MAKE_ID_SUBMIT_WEBHOOK_URL",
    description: "Fires when a client uploads ID docs. Moves files to Drive ID folder, alerts admin Discord channel.",
  },
  {
    name: "SNS — ID Verification Decision",
    envVar: "MAKE_VERIFICATION_WEBHOOK_URL",
    description: "Fires after admin approves or rejects ID. Sends client email/Discord invite (approved) or rejection email.",
  },
  {
    name: "SNS — Weekly Payout",
    envVar: "MAKE_PAYOUT_WEBHOOK_URL",
    description: "Fires weekly after payout calculations. Logs to Payouts sheet, sends each rep a Discord DM with their cut.",
  },
  {
    name: "SNS — New Lead",
    envVar: "MAKE_NEW_LEAD_WEBHOOK_URL",
    description: "Fires when a new lead is captured from Meta, GHL, or manual entry. Creates/updates GHL contact, notifies setter.",
  },
  {
    name: "SNS — Check-in Alert",
    envVar: "MAKE_CHECKIN_ALERT_WEBHOOK_URL",
    description: "Fires when a student's health score is ≤ 7. Alerts assigned coach via Discord DM, logs to coaching sheet.",
  },
  {
    name: "SNS — Staff Onboarding",
    envVar: "MAKE_STAFF_ONBOARDING_WEBHOOK_URL",
    description: "Fires when a new staff member is created. Copies KPI sheet template, sends Discord welcome DM, saves sheetId.",
  },
];

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  const apiKey  = process.env.MAKE_API_KEY;
  const teamId  = process.env.MAKE_TEAM_ID;

  if (!apiKey || !teamId) {
    return Response.json(
      {
        error: "Missing Make.com credentials",
        instructions: [
          "1. Go to Make.com → Profile icon (top-right) → API → Generate new token",
          "2. Copy the token → add to .env.local as: MAKE_API_KEY=\"your-token\"",
          "3. Open any Make.com scenario URL — the number in the URL is your team ID",
          "   Example: us2.make.com/team/12345/scenarios → teamId = 12345",
          "4. Add to .env.local as: MAKE_TEAM_ID=\"12345\"",
          "5. Re-run this endpoint",
        ],
      },
      { status: 400 }
    );
  }

  const numericTeamId = parseInt(teamId, 10);
  if (isNaN(numericTeamId)) {
    return Response.json({ error: "MAKE_TEAM_ID must be a number" }, { status: 400 });
  }

  const results: {
    scenario: string;
    envVar: string;
    webhookUrl: string | null;
    scenarioId: number | null;
    status: "created" | "existing" | "error";
    error?: string;
  }[] = [];

  for (const def of SCENARIOS) {
    const existingUrl = process.env[def.envVar];

    if (existingUrl) {
      results.push({
        scenario: def.name,
        envVar:   def.envVar,
        webhookUrl: existingUrl,
        scenarioId: null,
        status: "existing",
      });
      continue;
    }

    try {
      const hook     = await createHook(def.name, numericTeamId);
      const scenario = await createScenario(def.name, numericTeamId, hook.id, def.description);
      results.push({
        scenario:   def.name,
        envVar:     def.envVar,
        webhookUrl: hook.address,
        scenarioId: scenario.id,
        status:     "created",
      });
    } catch (err) {
      results.push({
        scenario:   def.name,
        envVar:     def.envVar,
        webhookUrl: null,
        scenarioId: null,
        status:     "error",
        error:      err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Build a ready-to-paste .env snippet for newly created webhooks
  const created = results.filter(r => r.status === "created" && r.webhookUrl);
  const envSnippet = created
    .map(r => `${r.envVar}="${r.webhookUrl}"`)
    .join("\n");

  return Response.json({
    results,
    summary: {
      created:  results.filter(r => r.status === "created").length,
      existing: results.filter(r => r.status === "existing").length,
      errors:   results.filter(r => r.status === "error").length,
    },
    envSnippet: envSnippet || null,
    nextSteps: created.length > 0
      ? [
          "1. Copy the envSnippet above into your .env.local file",
          "2. Add the same variables to Vercel Dashboard → Environment Variables",
          "3. Deploy to production so the routes can trigger the new webhooks",
          "4. Open Make.com — each new scenario is a stub (webhook trigger only). Add your action modules there.",
          "5. Run POST /api/admin/make-test to confirm all webhooks are live",
        ]
      : ["All scenarios already exist — run POST /api/admin/make-test to verify they are live"],
  });
}
