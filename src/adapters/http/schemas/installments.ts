import { z } from 'zod';
import { zMonth, zPositiveInt } from './common';

export const updateInstallmentSchema = z.object({
  category_id: zPositiveInt('category_id must be a positive integer'),
  card_id: zPositiveInt('card_id must be a positive integer'),
  description: z.string().optional(),
  total_cents: zPositiveInt('total_cents must be a positive integer'),
  count: zPositiveInt('count must be a positive integer'),
  first_month: zMonth('first_month must be YYYY-MM'),
});
