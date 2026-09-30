import type { LimitRepository } from '../ports';
import { addMonths } from './dates';

export function carryIntoMonth(limits: LimitRepository, categoryId: number, month: string): number {
  const first = limits.firstTxMonth(categoryId);
  if (!first || first >= month) return 0;
  let carry = 0;
  for (let m = first; m < month; m = addMonths(m, 1)) {
    const limit = limits.resolve(categoryId, m);
    const actual = limits.sumSpend(categoryId, m);
    const overage = limit > 0 ? Math.max(0, actual + carry - limit) : 0;
    carry = limits.carriesForward(categoryId, m) ? overage : 0;
  }
  return carry;
}

export function overageForMonth(
  limits: LimitRepository,
  categoryId: number,
  month: string,
  carryIn = carryIntoMonth(limits, categoryId, month),
): number {
  const limit = limits.resolve(categoryId, month);
  return limit > 0 ? Math.max(0, limits.sumSpend(categoryId, month) + carryIn - limit) : 0;
}
