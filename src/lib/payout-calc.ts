import type { Deal, DealPayout } from "./deal-types";

export function calculatePayouts(deal: Deal): DealPayout {
  const caelum = deal.netAmount * 0.15;
  const mediaBuyer = deal.leadSource === "ad" ? deal.grossAmount * 0.05 : 0;
  const setter = deal.closer ? deal.grossAmount * 0.10 : deal.grossAmount * 0.20;
  const closer = deal.closer ? deal.grossAmount * 0.10 : 0;
  const totalPayouts = caelum + mediaBuyer + setter + closer;
  const evanTakeHome = deal.netAmount - totalPayouts;
  return { caelum, mediaBuyer, setter, closer, totalPayouts, evanTakeHome };
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
