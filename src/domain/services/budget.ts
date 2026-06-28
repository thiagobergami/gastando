export type BudgetStatus = 'ok' | 'approaching' | 'over';

export function budgetStatus(
  spentCents: number,
  limitCents: number,
  approachAt = 0.8,
): BudgetStatus {
  if (limitCents > 0 && spentCents > limitCents) return 'over';
  if (limitCents > 0 && spentCents >= limitCents * approachAt) return 'approaching';
  return 'ok';
}
