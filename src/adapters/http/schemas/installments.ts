import { z } from 'zod';
import { zMonth, zPositiveInt } from './common';
import {
  bothSplitFieldsOrNeither,
  SPLIT_TOGETHER_MESSAGE,
  zSplitPercent,
  zSplitPersonId,
} from './split';

export const updateInstallmentSchema = z
  .object({
    category_id: zPositiveInt('category_id must be a positive integer'),
    card_id: zPositiveInt('card_id must be a positive integer'),
    description: z.string().optional(),
    total_cents: zPositiveInt('total_cents must be a positive integer'),
    count: zPositiveInt('count must be a positive integer'),
    first_month: zMonth('first_month must be YYYY-MM'),
    split_person_id: zSplitPersonId,
    split_percent: zSplitPercent,
  })
  .refine(bothSplitFieldsOrNeither, { message: SPLIT_TOGETHER_MESSAGE });

export const installmentPreviewSchema = z.object({
  total_cents: zPositiveInt('total_cents must be a positive integer'),
  count: zPositiveInt('count must be a positive integer'),
  split_percent: z.custom<number>(
    (v) => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 99,
    { message: 'split_percent must be an integer 1..99' },
  ),
});
