export function monthOf(date: string): string {
  return String(date).slice(0, 7);
}

export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

export function monthRange(from: string, to: string): string[] {
  const months: string[] = [];
  let cur = from;
  for (let i = 0; i < 600 && cur <= to; i++) {
    months.push(cur);
    cur = addMonths(cur, 1);
  }
  return months;
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export function chargeDate(month: string, day: number): string {
  const d = Math.min(Math.max(1, day), daysInMonth(month));
  return `${month}-${String(d).padStart(2, '0')}`;
}
