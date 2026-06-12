import { createClient } from "@supabase/supabase-js";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !["admin", "sales_exec", "executive"].includes(session.user.role)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = process.env.LEADWELL_SUPABASE_URL;
  const key = process.env.LEADWELL_SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    return Response.json({ error: "LEADWELL_SUPABASE_URL / LEADWELL_SUPABASE_SERVICE_KEY not configured" }, { status: 500 });
  }

  const supabase = createClient(url, key);

  const now = new Date();
  const mFrom = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const mTo   = now.toISOString().slice(0, 10);
  const yFrom = `${now.getUTCFullYear()}-01-01`;

  const [mtdRes, ytdRes, staffRes] = await Promise.all([
    supabase
      .from("daily_numbers")
      .select("staff_id,calls_made,sets,shows,sales,collections")
      .gte("date", mFrom)
      .lte("date", mTo),
    supabase
      .from("daily_numbers")
      .select("collections")
      .gte("date", yFrom)
      .lte("date", mTo),
    supabase
      .from("staff_accounts")
      .select("id,name"),
  ]);

  type MtdRow = { staff_id: string; calls_made: number; sets: number; shows: number; sales: number; collections: number };
  const mtd   = (mtdRes.data  ?? []) as MtdRow[];
  const ytd   = (ytdRes.data  ?? []) as { collections: number }[];
  const staff = (staffRes.data ?? []) as { id: string; name: string }[];

  const cashMTD     = Math.round(mtd.reduce((s, r) => s + Number(r.collections), 0));
  const cashYTD     = Math.round(ytd.reduce((s, r) => s + Number(r.collections), 0));
  const dealsClosed = mtd.reduce((s, r) => s + Number(r.sales), 0);
  const callsMade   = mtd.reduce((s, r) => s + Number(r.calls_made), 0);
  const demosSet    = mtd.reduce((s, r) => s + Number(r.sets), 0);
  const demosShowed = mtd.reduce((s, r) => s + Number(r.shows), 0);

  const repMap = new Map(staff.map(s => [s.id, s.name]));
  const repTotals = new Map<string, { name: string; collections: number; sales: number; calls_made: number; sets: number; shows: number }>();
  for (const row of mtd) {
    const name = repMap.get(row.staff_id) ?? row.staff_id;
    const cur  = repTotals.get(row.staff_id) ?? { name, collections: 0, sales: 0, calls_made: 0, sets: 0, shows: 0 };
    repTotals.set(row.staff_id, {
      name,
      collections: cur.collections + Number(row.collections),
      sales:       cur.sales       + Number(row.sales),
      calls_made:  cur.calls_made  + Number(row.calls_made),
      sets:        cur.sets        + Number(row.sets),
      shows:       cur.shows       + Number(row.shows),
    });
  }
  const reps = Array.from(repTotals.values()).sort((a, b) => b.collections - a.collections);

  return Response.json({
    cashMTD, cashYTD, dealsClosed, callsMade, demosSet, demosShowed, reps,
    fetchedAt: new Date().toISOString(),
  });
}
