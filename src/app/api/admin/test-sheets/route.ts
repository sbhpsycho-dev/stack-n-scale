import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSheetsToken, sheetsGet } from "@/lib/sheets-sync";

// GET /api/admin/test-sheets
// Diagnostic endpoint — verifies Google Sheets SA credentials and sheet access.
// Returns a per-sheet status so you can pinpoint exactly where the auth chain breaks.
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }

  const results: Record<string, { status: "ok" | "error"; detail?: string }> = {};

  // ── 1. Token exchange ──────────────────────────────────────────────────────
  let token: string;
  try {
    token = await getSheetsToken();
    results.auth = { status: "ok" };
  } catch (err) {
    results.auth = {
      status: "error",
      detail: err instanceof Error ? err.message : String(err),
    };
    // Can't proceed without a token
    return Response.json({ ok: false, results });
  }

  // ── 2. Master Deal Log ─────────────────────────────────────────────────────
  const masterLogId = process.env.GOOGLE_SHEETS_MASTER_LOG_ID;
  if (!masterLogId) {
    results.masterLog = { status: "error", detail: "GOOGLE_SHEETS_MASTER_LOG_ID env var not set" };
  } else {
    try {
      await sheetsGet(token, masterLogId, "Deal Log!A1:A2");
      results.masterLog = { status: "ok" };
    } catch (err) {
      results.masterLog = {
        status: "error",
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ── 3. Setter KPI Tracker ──────────────────────────────────────────────────
  const setterKpiId = process.env.GOOGLE_SHEETS_SETTER_KPI_ID;
  if (!setterKpiId) {
    results.setterKpi = { status: "error", detail: "GOOGLE_SHEETS_SETTER_KPI_ID env var not set" };
  } else {
    try {
      await sheetsGet(token, setterKpiId, "Daily Log!A1:A2");
      results.setterKpi = { status: "ok" };
    } catch (err) {
      results.setterKpi = {
        status: "error",
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ── 4. Onboarding Sheet (optional) ────────────────────────────────────────
  const onboardingId = process.env.GOOGLE_SHEETS_ONBOARDING_ID;
  if (onboardingId) {
    try {
      await sheetsGet(token, onboardingId, "A1:A2");
      results.onboarding = { status: "ok" };
    } catch (err) {
      results.onboarding = {
        status: "error",
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  }

  const allOk = Object.values(results).every(r => r.status === "ok");
  return Response.json({ ok: allOk, results });
}
