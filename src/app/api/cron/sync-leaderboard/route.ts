import { verifyCronSecret } from "@/lib/cron-auth";
import { ingestSetterKPISheet, updatePipelineFromReplogs } from "@/lib/sheets-sync";

export async function GET(req: Request) {
  if (!verifyCronSecret(req.headers.get("authorization"))) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const ingestResult = await ingestSetterKPISheet();
    await updatePipelineFromReplogs();
    return Response.json({ ok: true, ...ingestResult });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cron/sync-leaderboard] failed:", msg);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
