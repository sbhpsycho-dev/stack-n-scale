// "2026-05-19" → "5/19/2026"
export function fmtDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${m}/${d}/${y}`;
}

// ISO timestamp → "5/19/2026 2:45 PM"
export function fmtDateTime(isoStr: string): string {
  return new Date(isoStr).toLocaleString("en-US", {
    month: "numeric", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}
