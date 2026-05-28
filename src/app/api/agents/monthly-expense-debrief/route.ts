/**
 * SNS Monthly Expense Debrief Agent
 *
 * Runs on the 1st of each month at 11:30am (via Vercel cron) or on-demand
 * by an admin. Summarises last month's operating costs, compares to revenue,
 * calculates true P&L, and posts a rich Discord embed to the finance channel.
 *
 * Also accessible via GET for manual admin trigger.
 */

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { verifyCronSecret } from "@/lib/cron-auth";
import { sendDiscordDM } from "@/lib/discord";
import type { Session } from "next-auth";
import type { SNSExpense, ExpenseCategory } from "@/lib/expense-types";
import type { Deal } from "@/lib/deal-types";
import Anthropic from "@anthropic-ai/sdk";

// ─── Auth ─────────────────────────────────────────────────────────────────────

function isAdminOrCron(session: Session | null, authHeader: string | null): boolean {
  if (verifyCronSecret(authHeader)) return true;
  return session?.user?.role === "admin";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt$(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function prevMonthRange(): { start: string; end: string; label: string; key: string } {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const pad = (n: number) => String(n).padStart(2, "0");
  const start = `${prev.getFullYear()}-${pad(prev.getMonth() + 1)}-01`;
  const end   = `${thisMonth.getFullYear()}-${pad(thisMonth.getMonth() + 1)}-01`;
  const key   = `${prev.getFullYear()}-${pad(prev.getMonth() + 1)}`;
  const label = prev.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return { start, end, label, key };
}

// ─── GET handler (cron or admin trigger) ─────────────────────────────────────

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdminOrCron(session, req.headers.get("authorization"))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { start, end, label, key } = prevMonthRange();

  // ── 1. Gather expenses for the month ───────────────────────────────────────
  const expenseIds = (await kv.get<string[]>("sns:expenses:index")) ?? [];
  const allExpenses = (
    await Promise.all(expenseIds.map(id => kv.get<SNSExpense>(`sns:expenses:${id}`)))
  ).filter((e): e is SNSExpense => e !== null);

  // Fixed costs apply every month; variable costs must match the month
  const monthExpenses = allExpenses.filter(e => {
    if (e.recurrence === "fixed") return true;
    return e.date.startsWith(key);
  });

  const totalFixed    = monthExpenses.filter(e => e.recurrence === "fixed").reduce((s, e) => s + e.amount, 0);
  const totalVariable = monthExpenses.filter(e => e.recurrence === "variable").reduce((s, e) => s + e.amount, 0);
  const totalExpenses = totalFixed + totalVariable;

  const byCategory: Partial<Record<ExpenseCategory, number>> = {};
  for (const e of monthExpenses) {
    byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amount;
  }

  // ── 2. Gather revenue deals for the month ──────────────────────────────────
  const dealIds = (await kv.get<string[]>("sns:deals:index")) ?? [];
  const allDeals = (
    await Promise.all(dealIds.map(id => kv.get<Deal>(`sns:deals:${id}`)))
  ).filter((d): d is Deal => d !== null);

  const monthDeals = allDeals.filter(d => d.date >= start && d.date < end);
  const totalGross       = monthDeals.reduce((s, d) => s + d.grossAmount, 0);
  const totalFees        = monthDeals.reduce((s, d) => s + d.processorFee, 0);
  const totalNet         = monthDeals.reduce((s, d) => s + d.netAmount, 0);
  const totalCommissions = monthDeals.reduce((s, d) => s + d.payouts.totalPayouts, 0);
  const evanTakeHome     = monthDeals.reduce((s, d) => s + d.payouts.evanTakeHome, 0);
  const trueNet          = evanTakeHome - totalExpenses;

  // ── 3. Previous month for MoM comparison ───────────────────────────────────
  const now = new Date();
  const prev2 = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const prev2Key = `${prev2.getFullYear()}-${String(prev2.getMonth() + 1).padStart(2, "0")}`;
  const prevExpenses = allExpenses.filter(e => {
    if (e.recurrence === "fixed") return true;
    return e.date.startsWith(prev2Key);
  });
  const prevTotal = prevExpenses.reduce((s, e) => s + e.amount, 0);
  const prevDeals = allDeals.filter(d => {
    const ps = `${prev2.getFullYear()}-${String(prev2.getMonth() + 1).padStart(2, "0")}-01`;
    const pe = `${new Date(now.getFullYear(), now.getMonth() - 1, 1).getFullYear()}-${String(new Date(now.getFullYear(), now.getMonth() - 1, 1).getMonth() + 1).padStart(2, "0")}-01`;
    return d.date >= ps && d.date < pe;
  });
  const prevGross = prevDeals.reduce((s, d) => s + d.grossAmount, 0);

  const expenseDelta = prevTotal > 0 ? ((totalExpenses - prevTotal) / prevTotal * 100).toFixed(1) : null;
  const grossDelta   = prevGross > 0 ? ((totalGross - prevGross)   / prevGross * 100).toFixed(1)   : null;
  const coveredCosts = evanTakeHome >= totalExpenses;

  // ── 4. Generate AI debrief via Claude ─────────────────────────────────────
  let aiSummary = "";
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const context = `
Stack N Scale Enterprises — Monthly Financial Report: ${label}

REVENUE:
- Gross Revenue: ${fmt$(totalGross)} (${monthDeals.length} deals)
- Processor Fees: ${fmt$(totalFees)}
- Net Revenue: ${fmt$(totalNet)}
- Commissions Paid: ${fmt$(totalCommissions)}
- Evan Take Home: ${fmt$(evanTakeHome)}
${grossDelta ? `- MoM Change: ${parseFloat(grossDelta) >= 0 ? "+" : ""}${grossDelta}% vs prior month` : ""}

OPERATING EXPENSES:
- Fixed Costs: ${fmt$(totalFixed)}
- Variable Costs: ${fmt$(totalVariable)}
- Total Expenses: ${fmt$(totalExpenses)}
${expenseDelta ? `- MoM Change: ${parseFloat(expenseDelta) >= 0 ? "+" : ""}${expenseDelta}% vs prior month` : ""}

P&L:
- True Net (Evan Take Home − Operating Costs): ${fmt$(trueNet)}
- Break-even Status: ${coveredCosts ? "✅ COVERED — revenue exceeded operating costs" : "⚠️ SHORTFALL — operating costs exceeded revenue take-home"}

CATEGORY BREAKDOWN:
${Object.entries(byCategory).map(([cat, amt]) => `- ${cat}: ${fmt$(amt as number)}`).join("\n")}
`.trim();

    const message = await anthropic.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 400,
      system: `You are the financial analyst for Stack N Scale Enterprises, a high-ticket sales coaching company.
Write a concise monthly operations debrief (3-4 short paragraphs, max 350 words).
Cover: (1) revenue vs operating costs and true net, (2) biggest expense categories and any MoM changes worth noting, (3) break-even status and what it means, (4) exactly 2 action items to improve the P&L.
Use plain language, no markdown headers, be direct and business-focused.`,
      messages: [{ role: "user", content: context }],
    });

    aiSummary = message.content[0].type === "text" ? message.content[0].text : "";
  } catch (err) {
    console.error("[expense-debrief] Claude API error:", err);
    aiSummary = "AI summary unavailable — data below.";
  }

  // ── 5. Post to Discord — DM both admins (Caelum + Evan) ─────────────────
  const statusIcon = coveredCosts ? "✅" : "⚠️";

  const discordMsg = [
    `💼 **SNS Monthly Expense Debrief — ${label}** ${statusIcon}`,
    "",
    `**Revenue**`,
    `Cash Collected: ${fmt$(totalGross)} (${monthDeals.length} deals)${grossDelta ? `  *(${parseFloat(grossDelta) >= 0 ? "+" : ""}${grossDelta}% MoM)*` : ""}`,
    `Evan Take Home: ${fmt$(evanTakeHome)}`,
    "",
    `**Operating Costs**`,
    `Fixed: ${fmt$(totalFixed)}  |  Variable: ${fmt$(totalVariable)}  |  **Total: ${fmt$(totalExpenses)}**${expenseDelta ? `  *(${parseFloat(expenseDelta) >= 0 ? "+" : ""}${expenseDelta}% MoM)*` : ""}`,
    "",
    `**True Net: ${fmt$(trueNet)}** *(Evan Take Home − Operating Costs)*`,
    "",
    `**By Category:**`,
    ...Object.entries(byCategory).map(([cat, amt]) => `• ${cat}: ${fmt$(amt as number)}`),
    "",
    `**Analysis:**`,
    aiSummary,
  ].filter(l => l !== undefined).join("\n");

  const adminIds = [
    process.env.DISCORD_CAELUM_USER_ID,
    process.env.EVAN_DISCORD_USER_ID,
  ].filter(Boolean) as string[];

  await Promise.all(
    adminIds.map(id =>
      sendDiscordDM(id, discordMsg).catch(e =>
        console.error(`[expense-debrief] Discord DM error (${id}):`, e)
      )
    )
  );

  // ── 6. Persist report ────────────────────────────────────────────────────
  const report = {
    month:          key,
    label,
    generatedAt:    new Date().toISOString(),
    totalExpenses,
    totalFixed,
    totalVariable,
    totalGross,
    totalNet,
    totalCommissions,
    evanTakeHome,
    trueNet,
    coveredCosts,
    byCategory,
    aiSummary,
    dealCount:      monthDeals.length,
  };
  await kv.set(`sns:expense-reports:${key}`, report);

  return Response.json(report);
}
