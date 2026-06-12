import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { type Deal } from "@/lib/deal-types";
import { type CoachingClient } from "@/lib/coaching-types";

const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");

async function getDealsIndex(): Promise<string[]> {
  try {
    const fromList = (await kv.lrange("sns:deals:index", 0, -1)) as string[];
    if (fromList.length > 0) return fromList;
  } catch { /* fall through */ }
  return (await kv.get<string[]>("sns:deals:index")) ?? [];
}

/** GET = dry-run (shows what would change, writes nothing) */
export async function GET(req: Request) {
  return run(req, false);
}

/** POST = live run (writes clientEmail to deals that are missing it) */
export async function POST(req: Request) {
  return run(req, true);
}

async function run(req: Request, write: boolean) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  // 1. Load all deals
  const index = await getDealsIndex();
  if (!index.length) return Response.json({ updated: 0, skipped: 0, unmatched: 0, write });

  const allDeals = (await Promise.all(index.map(id => kv.get<Deal>(`sns:deals:${id}`)))).filter(Boolean) as Deal[];

  // 2. Build normalizedName → email map from coaching clients
  const clientKeys = await kv.keys("sns:coaching:client:*");
  const clients = (await Promise.all(clientKeys.map(k => kv.get<CoachingClient>(k)))).filter(Boolean) as CoachingClient[];
  const nameToEmail = new Map<string, string>();
  for (const c of clients) {
    if (c.name && c.email) nameToEmail.set(norm(c.name), c.email.toLowerCase());
  }

  // 3. For each deal missing clientEmail, try to match by name
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

  return Response.json({ updated, skipped, unmatched, unmatchedNames: write ? undefined : unmatchedNames, write });
}
