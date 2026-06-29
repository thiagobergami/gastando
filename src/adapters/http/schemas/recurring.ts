import { z } from 'zod';
import { zPositiveInt } from './common';

const dayOfMonth = z.custom<number>(
  (v) => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 31,
  { message: 'day_of_month must be an integer 1..31' },
);

export const recurringBodySchema = z.object({
  description: z.string().optional(),
  category_id: zPositiveInt('category_id must be a positive integer'),
  card_id: zPositiveInt('card_id must be a positive integer'),
  amount_cents: zPositiveInt('amount_cents must be a positive integer'),
  day_of_month: dayOfMonth,
});

export const materializeSchema = z.object({
  month: z.custom<string>((v) => typeof v === 'string' && /^\d{4}-\d{2}$/.test(v), {
    message: 'month must be YYYY-MM',
  }),
});
