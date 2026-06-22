import { z } from 'zod';
import { zDate, zMonth, zPositiveInt } from './common';

// Single-shot transaction body: validates the same fields, in the same order,
// as the legacy route. category_id/card_id existence is enforced by the
// use-case (so a missing/unknown id yields "category_id does not exist").
export const singleTransactionSchema = z.object({
  date: zDate('date must be YYYY-MM-DD'),
  amount_cents: zPositiveInt('amount_cents must be a positive integer'),
});

export const installmentTransactionSchema = z.object({
  installment_total_cents: zPositiveInt('installment_total_cents must be a positive integer'),
  installment_count: zPositiveInt('installment_count must be a positive integer'),
  first_month: zMonth('first_month must be YYYY-MM'),
});

export const updateTransactionSchema = z.object({
  date: zDate('date must be YYYY-MM-DD'),
  amount_cents: zPositiveInt('amount_cents must be a positive integer'),
});
