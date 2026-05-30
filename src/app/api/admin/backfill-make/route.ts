import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { triggerScenario } from "@/lib/make";
import type { CoachingClient } from "@/lib/coaching-types";

export const runtime = "nodejs";
export const maxDuration = 300;

type BackfillResult = {
  email: string;
  status: "ok" | "skipped" | "error";
  error?: string;
};

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!process.env.MAKE_ONBOARDING_FORM_WEBHOOK_URL) {
    return Response.json({ ok: false, error: "MAKE_ONBOARDING_FORM_WEBHOOK_URL is not configured" }, { status: 500 });
  }

  // Find every email that has a form submission in KV
  const formKeys = await kv.keys("sns:onboarding:form:*");

  if (formKeys.length === 0) {
    return Response.json({ ok: true, total: 0, succeeded: 0, failed: 0, skipped: 0, results: [] });
  }

  const results: BackfillResult[] = [];

  for (const key of formKeys) {
    const email = (key as string).replace("sns:onboarding:form:", "");
    const result: BackfillResult = { email, status: "ok" };

    try {
      const [formData, client] = await Promise.all([
        kv.get<Record<string, string>>(`sns:onboarding:form:${email}`),
        kv.get<CoachingClient>(`sns:coaching:client:${email}`),
      ]);

      if (!formData) {
        result.status = "skipped";
        results.push(result);
        continue;
      }

      const { ok } = await triggerScenario(
        "MAKE_ONBOARDING_FORM_WEBHOOK_URL",
        {
          name:             formData.name ?? "",
          email:            formData.email ?? email,
          ghlContactId:     client?.ghlContactId ?? null,
          submittedAt:      formData.submittedAt ?? null,
          motivation:       formData.motivation ?? "",
          whySNS:           formData.whySNS ?? "",
          goal30Days:       formData.goal30Days ?? "",
          goal3Months:      formData.goal3Months ?? "",
          goal6Months:      formData.goal6Months ?? "",
          goal1Year:        formData.goal1Year ?? "",
          biggestChallenge: formData.biggestChallenge ?? "",
          successIn90Days:  formData.successIn90Days ?? "",
          additionalNotes:  formData.additionalNotes ?? "",
        },
        { awaitResponse: true, timeout: 10_000 },
      );

      if (!ok) {
        result.status = "error";
        result.error = "Make.com webhook returned non-2xx";
      }
    } catch (e) {
      result.status = "error";
      result.error = e instanceof Error ? e.message : String(e);
    }

    results.push(result);
  }

  const succeeded = results.filter(r => r.status === "ok").length;
  const failed    = results.filter(r => r.status === "error").length;
  const skipped   = results.filter(r => r.status === "skipped").length;

  return Response.json({ ok: true, total: formKeys.length, succeeded, failed, skipped, results });
}
