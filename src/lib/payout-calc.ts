import type { Deal, DealPayout } from "./deal-types";

export function calculatePayouts(deal: Deal): DealPayout {
  const caelum     = Math.round(deal.netAmount * 0.15);
  const mediaBuyer = deal.leadSource === "ad" ? Math.round(deal.grossAmount * 0.05) : 0;

  const dmSetter = deal.dmSetter ? Math.round(deal.grossAmount * 0.10) : 0;
  const setter   = deal.setter   ? Math.round(deal.grossAmount * 0.10) : 0;
  const closer      = deal.closer   ? Math.round(deal.grossAmount * 0.10) : 0;

  const totalPayouts        = caelum + mediaBuyer + dmSetter + setter + closer;
  const remaining           = deal.netAmount - totalPayouts;
  const companyReinvestment = Math.round(remaining * 0.10);
  const evanTakeHome        = remaining - companyReinvestment;
  return { caelum, mediaBuyer, dmSetter, setter, closer, totalPayouts, companyReinvestment, evanTakeHome };
}

export function getWeekId(date: Date = new Date()): string {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  d.setUTCDate(diff);
  return d.toISOString().slice(0, 10);
}

export function getWeekBounds(weekId: string): { start: string; end: string } {
  const start = new Date(weekId + "T00:00:00Z");
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}
