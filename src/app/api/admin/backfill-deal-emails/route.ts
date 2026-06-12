import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { type Deal } from "@/lib/deal-types";
import { type CoachingClient } from "@/lib/coaching-types";

const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");

/** GET = dry-run (shows what would change, writes nothing) */
export async function GET(req: Request) {
  return run(req, false);
}

/** POST = live run. Rebuilds the deals index from all sns:deals:* keys,
 *  then writes clientEmail onto deals that are missing it. Run once after deploy. */
export async function POST(req: Request) {
  return run(req, true);
}

async function run(req: Request, write: boolean) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  // ── Step 1: Discover ALL deals by scanning keys directly ─────────────────────
  // This bypasses the corrupted/incomplete index and finds every deal ever stored.
  const allKeys = await kv.keys("sns:deals:*");
  const dealKeys = allKeys.filter(k => k !== "sns:deals:index");
  const dealIds = dealKeys.map(k => k.replace("sns:deals:", ""));

  const allDeals = (
    await Promise.all(dealKeys.map(k => kv.get<Deal>(k)))
  ).filter(Boolean) as Deal[];

  // ── Step 2: Rebuild the index as a clean Redis List ───────────────────────────
  if (write && dealIds.length > 0) {
    await kv.del("sns:deals:index");
    await kv.lpush("sns:deals:index", ...dealIds);
  }

  // ── Step 3: Backfill clientEmail on deals missing it ─────────────────────────
  const clientKeys = await kv.keys("sns:coaching:client:*");
  const clients = (
    await Promise.all(clientKeys.map(k => kv.get<CoachingClient>(k)))
  ).filter(Boolean) as CoachingClient[];

  const nameToEmail = new Map<string, string>();
  for (const c of clients) {
    if (c.name && c.email) nameToEmail.set(norm(c.name), c.email.toLowerCase());
  }

  let updated = 0, skipped = 0, unmatched = 0;
  const unmatchedNames: string[] = [];

  await Promise.all(allDeals.map(async deal => {
    if (deal.clientEmail) { skipped++; return; }
    const matchEmail = nameToEmail.get(norm(deal.clientName ?? ""));
    if (!matchEmail) { unmatched++; unmatchedNames.push(deal.clientName ?? ""); return; }
    if (write) {
      await kv.set(`sns:deals:${deal.id}`, { ...deal, clientEmail: matchEmail });
    }
    updated++;
  }));

  return Response.json({
    indexRebuilt: write ? dealIds.length : null,
    totalDealsFound: dealIds.length,
    emailBackfill: { updated, skipped, unmatched },
    unmatchedNames: write ? undefined : unmatchedNames,
    write,
  });
}
