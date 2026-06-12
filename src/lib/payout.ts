export type Deal = {
  clientName: string;
  collected: number;
  setter: string | null;
  closer: string | null;
  closedWithEvan: boolean;
};

export type PayoutResult = {
  deals: Deal[];
  reps: { name: string; total: number; lines: string[] }[];
  overhead: { caelum: number; nick: number; mateo: number };
  totalCollected: number;
  totalOwed: number;
  retained: number;
  needsReview: { client: string; missing: string }[];
  sanityOk: boolean;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function calculatePayout(
  deals: Deal[],
  needsReview: { client: string; missing: string }[]
): PayoutResult {
  const repMap = new Map<string, { total: number; lines: string[] }>();

  function addRep(name: string, amount: number, line: string) {
    if (!repMap.has(name)) repMap.set(name, { total: 0, lines: [] });
    const r = repMap.get(name)!;
    r.total = round2(r.total + amount);
    r.lines.push(line);
  }

  let caelumTotal = 0;
  let nickTotal = 0;
  let mateoTotal = 0;
  let totalCollected = 0;
  let totalCuts = 0;

  for (const deal of deals) {
    const c = deal.collected;
    totalCollected = round2(totalCollected + c);

    const caelumCut = round2(c * 0.15);
    const nickCut   = round2(c * 0.05);
    const mateoCut  = round2(c * 0.025);
    caelumTotal = round2(caelumTotal + caelumCut);
    nickTotal   = round2(nickTotal + nickCut);
    mateoTotal  = round2(mateoTotal + mateoCut);

    if (deal.closedWithEvan) {
      // Setter gets 20%, Evan takes the rest after overhead
      const setterCut = deal.setter ? round2(c * 0.20) : 0;
      const evanCut   = round2(c - setterCut - caelumCut - nickCut - mateoCut);
      totalCuts = round2(totalCuts + setterCut + evanCut + caelumCut + nickCut + mateoCut);

      if (deal.setter) {
        addRep(deal.setter, setterCut, `• set ${deal.clientName} (Evan close) — 20% of $${fmt(c)} = $${fmt(setterCut)}`);
      }
      addRep("Evan", evanCut, `• closed ${deal.clientName} — remainder after cuts = $${fmt(evanCut)}`);
    } else {
      // Standard: setter 10%, closer 10% (additive if same person)
      const setterCut = deal.setter ? round2(c * 0.10) : 0;
      const closerCut = deal.closer ? round2(c * 0.10) : 0;
      totalCuts = round2(totalCuts + setterCut + closerCut + caelumCut + nickCut + mateoCut);

      if (deal.setter) {
        addRep(deal.setter, setterCut, `• set ${deal.clientName} — 10% of $${fmt(c)} = $${fmt(setterCut)}`);
      }
      if (deal.closer) {
        addRep(deal.closer, closerCut, `• closed ${deal.clientName} — 10% of $${fmt(c)} = $${fmt(closerCut)}`);
      }
    }
  }

  const repCutsTotal = Array.from(repMap.values()).reduce((s, r) => round2(s + r.total), 0);
  const overheadTotal = round2(caelumTotal + nickTotal + mateoTotal);
  const totalOwed = round2(repCutsTotal + overheadTotal);
  const retained = round2(totalCollected - totalOwed);
  // Cross-check: per-deal sum should equal roll-up total
  const sanityOk = Math.abs(totalCuts - totalOwed) < 0.02;

  return {
    deals,
    reps: Array.from(repMap.entries()).map(([name, { total, lines }]) => ({ name, total, lines })),
    overhead: { caelum: caelumTotal, nick: nickTotal, mateo: mateoTotal },
    totalCollected,
    totalOwed,
    retained,
    needsReview,
    sanityOk,
  };
}

export function formatReceipt(
  result: PayoutResult,
  weekMon: string,
  weekFri: string
): string[] {
  const lines: string[] = [];

  lines.push(`📊 WEEKLY PAYOUT RECEIPT — week of ${weekMon}–${weekFri}`);
  lines.push(`${result.deals.length} deals · $${fmt(result.totalCollected)} collected · $${fmt(result.totalOwed)} owed out`);
  lines.push(`Margin retained: $${fmt(result.retained)}`);
  lines.push("━━━━━━━━━━━━━━━━━━━━");
  lines.push("");
  lines.push("REPS / CLOSERS");

  if (result.reps.length === 0) {
    lines.push("(none this week)");
  } else {
    for (const rep of result.reps) {
      lines.push(`${rep.name} → $${fmt(rep.total)}`);
      for (const line of rep.lines) lines.push(line);
    }
  }

  lines.push("");
  lines.push("OVERHEAD");
  lines.push(`Caelum → $${fmt(result.overhead.caelum)} (15% of all collected)`);
  lines.push(`Nick → $${fmt(result.overhead.nick)} (5% of all collected)`);
  lines.push(`Mateo → $${fmt(result.overhead.mateo)} (2.5% of all collected)`);

  if (result.needsReview.length > 0) {
    lines.push("");
    lines.push("⚠️ NEEDS REVIEW");
    for (const item of result.needsReview) {
      lines.push(`• ${item.client} — missing ${item.missing}`);
    }
  }

  if (!result.sanityOk) {
    lines.push("");
    lines.push("🚨 SANITY CHECK FAILED — totals do not reconcile. Do not pay until reviewed manually.");
  }

  // Split into ≤1900-char chunks so Discord's 2000-char cap is never hit
  const messages: string[] = [];
  let current = "";
  for (const line of lines) {
    const next = current ? current + "\n" + line : line;
    if (next.length > 1900) {
      messages.push(current);
      current = line;
    } else {
      current = next;
    }
  }
  if (current) messages.push(current);

  return messages;
}
