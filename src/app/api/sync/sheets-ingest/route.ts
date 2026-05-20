import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ingestSetterKPISheet, updatePipelineFromReplogs, bumpPipelineVersion } from "@/lib/sheets-sync";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const { staffUpdated, rowsProcessed } = await ingestSetterKPISheet();
    await updatePipelineFromReplogs();
    await bumpPipelineVersion();
    return Response.json({ ok: true, staffUpdated, rowsProcessed });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
