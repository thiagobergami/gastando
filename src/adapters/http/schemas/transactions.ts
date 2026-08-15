import { z } from 'zod';
import { zDate, zMonth, zPositiveInt } from './common';

const zSplitPersonId = z
  .union([zPositiveInt('split_person_id must be a positive integer'), z.null()])
  .optional();

const zSplitPercent = z
  .union([
    z.custom<number>((v) => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 99, {
      message: 'split_percent must be an integer 1..99',
    }),
    z.null(),
  ])
  .optional();

// split_person_id e split_percent chegam juntos ou nenhum dos dois — enviar só
// um dos dois deixaria a transação com metade de um split, que não é um
// estado válido (design 2026-08-14, "Data model").
function bothSplitFieldsOrNeither(v: {
  split_person_id?: number | null;
  split_percent?: number | null;
}) {
  const hasPerson = v.split_person_id !== undefined && v.split_person_id !== null;
  const hasPercent = v.split_percent !== undefined && v.split_percent !== null;
  return hasPerson === hasPercent;
}

const SPLIT_TOGETHER_MESSAGE = 'split_person_id and split_percent must be provided together';

// Single-shot transaction body: validates the same fields, in the same order,
// as the legacy route. category_id/card_id existence is enforced by the
// use-case (so a missing/unknown id yields "category_id does not exist").
export const singleTransactionSchema = z
  .object({
    date: zDate('date must be YYYY-MM-DD'),
    amount_cents: zPositiveInt('amount_cents must be a positive integer'),
    split_person_id: zSplitPersonId,
    split_percent: zSplitPercent,
  })
  .refine(bothSplitFieldsOrNeither, { message: SPLIT_TOGETHER_MESSAGE });

// Sem campos de split: parcelamento passa por `installments.createPurchase()`,
// que não tem colunas de split para gravar (§Global Constraints deste plano).
export const installmentTransactionSchema = z.object({
  installment_total_cents: zPositiveInt('installment_total_cents must be a positive integer'),
  installment_count: zPositiveInt('installment_count must be a positive integer'),
  first_month: zMonth('first_month must be YYYY-MM'),
});

export const updateTransactionSchema = z
  .object({
    date: zDate('date must be YYYY-MM-DD'),
    amount_cents: zPositiveInt('amount_cents must be a positive integer'),
    split_person_id: zSplitPersonId,
    split_percent: zSplitPercent,
  })
  .refine(bothSplitFieldsOrNeither, { message: SPLIT_TOGETHER_MESSAGE });
