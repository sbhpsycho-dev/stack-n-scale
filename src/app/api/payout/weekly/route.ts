import { calculatePayout, formatReceipt, type Deal } from "@/lib/payout";
import { sendDiscordDM } from "@/lib/discord";

const GHL_BASE = "https://services.leadconnectorhq.com";

function ghlHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.GHL_API_KEY ?? ""}`,
    Version: "2021-07-28",
  };
}

/** Mon 00:00 → Fri 23:59:59 UTC for the current calendar week. */
function weekBounds() {
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0=Sun
  const daysFromMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const mon = new Date(now);
  mon.setUTCDate(now.getUTCDate() - daysFromMon);
  mon.setUTCHours(0, 0, 0, 0);

  const fri = new Date(mon);
  fri.setUTCDate(mon.getUTCDate() + 4);
  fri.setUTCHours(23, 59, 59, 999);

  const label = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

  return { start: mon.toISOString(), end: fri.toISOString(), monLabel: label(mon), friLabel: label(fri) };
}

// ── GHL metadata discovery ────────────────────────────────────────────────────

interface GHLField  { id: string; name: string }
interface GHLStage  { id: string; name: string }
interface GHLPipeline { stages?: GHLStage[] }

async function discoverFieldIds(locationId: string): Promise<{
  setterFieldId: string | null;
  closerFieldId: string | null;
  collectedFieldId: string | null;
}> {
  const res = await fetch(
    `${GHL_BASE}/custom-fields?locationId=${locationId}`,
    { headers: ghlHeaders(), signal: AbortSignal.timeout(8_000) }
  );
  if (!res.ok) return { setterFieldId: null, closerFieldId: null, collectedFieldId: null };

  const json = await res.json() as { customFields?: GHLField[] };
  const fields = json.customFields ?? [];
  const find = (kw: string) =>
    fields.find(f => f.name.toLowerCase().includes(kw))?.id ?? null;

  return {
    setterFieldId:    find("setter"),
    closerFieldId:    find("closer"),
    collectedFieldId: find("collected") ?? find("cash"),
  };
}

async function discoverClosedStageId(locationId: string): Promise<string | null> {
  const res = await fetch(
    `${GHL_BASE}/opportunities/pipelines?locationId=${locationId}`,
    { headers: ghlHeaders(), signal: AbortSignal.timeout(8_000) }
  );
  if (!res.ok) return null;

  const json = await res.json() as { pipelines?: GHLPipeline[] };
  for (const pipeline of json.pipelines ?? []) {
    for (const stage of pipeline.stages ?? []) {
      if (stage.name.toLowerCase().includes("closed") || stage.name.toLowerCase().includes("won")) {
        return stage.id;
      }
    }
  }
  return null;
}

// ── Opportunities fetch ───────────────────────────────────────────────────────

interface GHLOpportunity {
  id: string;
  name: string;
  monetaryValue?: number;
  status: string;
  assignedTo?: string;
  contact?: { name?: string };
  customFields?: { id: string; fieldValue: string }[];
}

function getCustomField(fields: { id: string; fieldValue: string }[], id: string): string {
  return fields.find(f => f.id === id)?.fieldValue ?? "";
}

async function fetchWeekOpportunities(
  start: string,
  end: string,
  stageId: string | null
): Promise<GHLOpportunity[]> {
  const params = new URLSearchParams({
    location_id: process.env.GHL_LOCATION_ID ?? "",
    startDate: start,
    endDate: end,
    limit: "100",
    ...(stageId ? { pipeline_stage_id: stageId } : { status: "won" }),
  });

  const res = await fetch(`${GHL_BASE}/opportunities/search?${params}`, {
    headers: ghlHeaders(),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new Error(`GHL ${res.status}: ${await res.text()}`);

  const json = await res.json() as { opportunities?: GHLOpportunity[] };
  return json.opportunities ?? [];
}

// ── Discord delivery ──────────────────────────────────────────────────────────

async function sendToRecipient(userId: string, messages: string[]): Promise<void> {
  for (const msg of messages) {
    await sendDiscordDM(userId, msg);
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: Request): Promise<Response> {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const locationId = process.env.GHL_LOCATION_ID;
  if (!process.env.GHL_API_KEY || !locationId) {
    return Response.json({ ok: false, error: "GHL_API_KEY / GHL_LOCATION_ID not configured" }, { status: 500 });
  }

  const { start, end, monLabel, friLabel } = weekBounds();

  // Discover IDs and fetch deals in parallel
  const [{ setterFieldId, closerFieldId, collectedFieldId }, stageId, rawOpps] =
    await Promise.all([
      discoverFieldIds(locationId),
      discoverClosedStageId(locationId),
      fetchWeekOpportunities(start, end, null).catch((err: unknown) => {
        throw new Error(String(err));
      }),
    ]).catch(err => { throw err; });

  // Re-fetch with the discovered stage ID if available (more precise than status:won)
  let opportunities = rawOpps;
  if (stageId) {
    try {
      opportunities = await fetchWeekOpportunities(start, end, stageId);
    } catch {
      // Fall back to the already-fetched status:won results
    }
  }

  const deals: Deal[] = [];
  const needsReview: { client: string; missing: string }[] = [];

  for (const opp of opportunities) {
    const clientName = opp.contact?.name ?? opp.name ?? "Unknown";
    const fields = opp.customFields ?? [];

    const collectedRaw = collectedFieldId
      ? getCustomField(fields, collectedFieldId)
      : String(opp.monetaryValue ?? "");
    const collected = parseFloat(collectedRaw);

    const setter    = setterFieldId ? getCustomField(fields, setterFieldId) || null : null;
    const rawCloser = closerFieldId ? getCustomField(fields, closerFieldId) || null : null;

    // Detect Evan as closer by name in the closer field value
    const closedWithEvan = !!(rawCloser && rawCloser.toLowerCase().includes("evan"));
    const closer = closedWithEvan ? null : rawCloser;

    const missing: string[] = [];
    if (!collected || isNaN(collected)) missing.push("collected amount");
    if (!setter && !closedWithEvan)     missing.push("setter");
    if (!closer && !closedWithEvan)     missing.push("closer");

    if (missing.length > 0) {
      needsReview.push({ client: clientName, missing: missing.join(", ") });
      continue;
    }

    deals.push({ clientName, collected, setter, closer, closedWithEvan });
  }

  if (deals.length === 0 && needsReview.length === 0) {
    return Response.json({ ok: true, message: "No closed deals this week", deals: 0 });
  }

  const result   = calculatePayout(deals, needsReview);
  const messages = formatReceipt(result, monLabel, friLabel);

  const recipients = [
    process.env.DISCORD_CAELUM_USER_ID,
    process.env.EVAN_DISCORD_USER_ID,
  ].filter((id): id is string => Boolean(id));

  await Promise.allSettled(recipients.map(id => sendToRecipient(id, messages)));

  return Response.json({
    ok: true,
    deals: deals.length,
    needsReview: needsReview.length,
    totalCollected: result.totalCollected,
    totalOwed: result.totalOwed,
    sanityOk: result.sanityOk,
    discoveredStageId: stageId,
    discoveredFields: { setterFieldId, closerFieldId, collectedFieldId },
  });
}
