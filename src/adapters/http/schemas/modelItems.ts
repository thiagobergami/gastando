import { z } from 'zod';
import { zNonNegInt } from './common';

const modelItemKind = z.custom<'income' | 'fixed_cost'>(
  (v) => v === 'income' || v === 'fixed_cost',
  { message: "kind must be 'income' or 'fixed_cost'" },
);

export const listModelItemsQuerySchema = z.object({
  kind: modelItemKind,
});

export const createModelItemSchema = z.object({
  kind: modelItemKind,
  name: z.custom<string>((v) => !!v, { message: 'name is required' }),
  amount_cents: zNonNegInt('amount_cents must be a non-negative integer'),
});

export const updateModelItemSchema = z.object({
  name: z.custom<string>((v) => !!v, { message: 'name is required' }),
  amount_cents: zNonNegInt('amount_cents must be a non-negative integer'),
});
