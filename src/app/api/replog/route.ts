import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import {
  syncReplogToSheets,
  syncReplogToRepSheet,
  syncDeleteFromSheets,
  triggerMakeReplogWebhook,
  updatePipelineFromReplogs,
  bumpPipelineVersion,
} from "@/lib/sheets-sync";
import { sendChannelMessage } from "@/lib/discord";

export type DailyEntry = {
  date: string; // YYYY-MM-DD
  callsMade: number;
  callsAnswered: number;
  demosSet: number;
  demosShowed: number;
  pitched: number;
  closed: number;
  cashCollected: number;
};

const replogKey = (clientId: string) => `sns-replog-${clientId}`;

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const target = new URL(req.url).searchParams.get("target");
  if (target && session.user.role !== "admin") return new Response("Forbidden", { status: 403 });
  const id = session.user.role === "admin" && target
    ? target
    : session.user.role === "admin"
    ? "admin"
    : (session.user.clientId ?? "");

  try {
    const entries = (await kv.get<DailyEntry[]>(replogKey(id))) ?? [];
    return Response.json(entries);
  } catch {
    return Response.json([]);
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const id = session.user.role === "admin"
    ? "admin"
    : (session.user.clientId ?? "");

  try {
    const entry = await req.json() as DailyEntry;
    const existing = (await kv.get<DailyEntry[]>(replogKey(id))) ?? [];
    const updated = existing.some(e => e.date === entry.date)
      ? existing.map(e => e.date === entry.date ? entry : e)
      : [entry, ...existing].sort((a, b) => b.date.localeCompare(a.date));
    await kv.set(replogKey(id), updated);
    await kv.set("sns-pipeline-lastmod", Date.now());

    const staffName = session.user.name ?? "Staff";

    // Run each sync step independently so a failure in one doesn't block the others.
    // The Setter KPI Daily Log is the critical path — its error is surfaced to the UI.
    let sheetsSync: "ok" | "error" = "ok";
    let syncError: string | undefined;

    // Step 1 — Setter KPI Daily Log (critical path)
    try {
      await syncReplogToSheets(staffName, entry);
    } catch (err) {
      console.error("[replog] setter KPI sync failed:", err);
      sheetsSync = "error";
      syncError = err instanceof Error ? err.message : String(err);
    }

    // Step 2 — Rep's personal sheet "Daily Activity" tab (best-effort, non-fatal)
    syncReplogToRepSheet(staffName, entry).catch(e =>
      console.error("[replog] personal rep sheet sync failed:", e)
    );

    // Step 3 — Make.com webhook (best-effort, skips silently if URL not configured)
    triggerMakeReplogWebhook(staffName, entry).catch(e =>
      console.error("[replog] make webhook failed:", e)
    );

    // Step 4 — Discord #boiler-room callout via SNS bot (best-effort)
    sendChannelMessage(
      "1497034366335979662",
      `📊 **${staffName}** logged numbers for ${entry.date}\n> Calls: ${entry.callsMade} dialed / ${entry.callsAnswered} answered\n> Demos: ${entry.demosSet} set / ${entry.demosShowed} showed\n> Closed: ${entry.closed} | 💰 $${entry.cashCollected}`
    ).catch(e => console.error("[replog] discord notify failed:", e));

    // KV pipeline rebuild is fast — always run fire-and-forget after returning
    updatePipelineFromReplogs().catch(e => console.error("[replog] pipeline update failed:", e));
    bumpPipelineVersion().catch(() => {});

    return Response.json({ ok: true, sheetsSync, syncError });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const id = session.user.role === "admin"
    ? "admin"
    : (session.user.clientId ?? "");

  try {
    const { date } = await req.json() as { date: string };
    if (!date) return new Response("Bad Request", { status: 400 });

    const existing = (await kv.get<DailyEntry[]>(replogKey(id))) ?? [];
    await kv.set(replogKey(id), existing.filter(e => e.date !== date));
    await kv.set("sns-pipeline-lastmod", Date.now());

    const staffName = session.user.name ?? "Staff";
    syncDeleteFromSheets(staffName, date).catch(e => console.error("[replog delete] sheets clear failed:", e));
    updatePipelineFromReplogs().catch(() => {});

    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}

