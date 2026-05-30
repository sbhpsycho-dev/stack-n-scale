import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSheetsToken, sheetsGet } from "@/lib/sheets-sync";

function parseMoney(val: string | number | undefined): number {
  if (typeof val === "number") return val;
  if (!val) return 0;
  return parseFloat(String(val).replace(/[$,]/g, "")) || 0;
}

function isCurrentMonth(dateStr: string): boolean {
  const now = new Date();
  const d = new Date(dateStr);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function isCurrentWeek(dateStr: string): boolean {
  const now = new Date();
  const d = new Date(dateStr);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  return d >= startOfWeek;
}

function getWeekLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const startOfYear = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
  return `W${week} '${String(d.getFullYear()).slice(2)}`;
}

function getMonthLabel(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

const EMPTY = {
  totalDeals: 0, totalGross: 0, totalCommission: 0,
  mtdDeals: 0, mtdGross: 0, mtdCommission: 0,
  weekDeals: 0, weekCommission: 0,
  recentDeals: [], growthByWeek: [], growthByMonth: [],
};

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "staff" && session.user.role !== "admin")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const sheetId = session.user.sheetId;
  if (!sheetId) return Response.json(EMPTY);

  try {
    const token = await getSheetsToken();
    const result = await sheetsGet(token, sheetId, "A:F");
    const rows: string[][] = result.values ?? [];

    const dataRows = rows.filter((r) => {
      if (!r[0]) return false;
      if (r[0].toLowerCase() === "date") return false;
      return r.length >= 4;
    });

    let totalDeals = 0, totalGross = 0, totalCommission = 0;
    let mtdDeals = 0, mtdGross = 0, mtdCommission = 0;
    let weekDeals = 0, weekCommission = 0;

    const weekMap = new Map<string, { commission: number; deals: number }>();
    const monthMap = new Map<string, { commission: number; deals: number }>();

    for (const row of dataRows) {
      const dateStr = row[0];
      const gross = parseMoney(row[2]);
      const cut = parseMoney(row[3]);

      totalDeals++;
      totalGross += gross;
      totalCommission += cut;

      if (isCurrentMonth(dateStr)) {
        mtdDeals++;
        mtdGross += gross;
        mtdCommission += cut;
      }

      if (isCurrentWeek(dateStr)) {
        weekDeals++;
        weekCommission += cut;
      }

      const wLabel = getWeekLabel(dateStr);
      const wPrev = weekMap.get(wLabel) ?? { commission: 0, deals: 0 };
      weekMap.set(wLabel, { commission: wPrev.commission + cut, deals: wPrev.deals + 1 });

      const mLabel = getMonthLabel(dateStr);
      const mPrev = monthMap.get(mLabel) ?? { commission: 0, deals: 0 };
      monthMap.set(mLabel, { commission: mPrev.commission + cut, deals: mPrev.deals + 1 });
    }

    const recentDeals = dataRows.slice(-20).reverse().map((row) => ({
      date: row[0],
      clientName: row[1] ?? "",
      gross: parseMoney(row[2]),
      commission: parseMoney(row[3]),
      role: row[4] ?? "",
    }));

    const growthByWeek = Array.from(weekMap.entries())
      .map(([week, d]) => ({ week, commission: Math.round(d.commission), deals: d.deals }))
      .slice(-8);

    const growthByMonth = Array.from(monthMap.entries())
      .map(([month, d]) => ({ month, commission: Math.round(d.commission), deals: d.deals }))
      .slice(-6);

    return Response.json({
      totalDeals,
      totalGross: Math.round(totalGross),
      totalCommission: Math.round(totalCommission),
      mtdDeals,
      mtdGross: Math.round(mtdGross),
      mtdCommission: Math.round(mtdCommission),
      weekDeals,
      weekCommission: Math.round(weekCommission),
      recentDeals,
      growthByWeek,
      growthByMonth,
    });
  } catch (err) {
    console.error("personal kpi error:", err);
    return new Response("Failed to load personal KPI data", { status: 500 });
  }
}
