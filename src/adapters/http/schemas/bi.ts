import { z } from 'zod';
import { zMonth, zPositiveInt } from './common';

export const biRangeSchema = z
  .object({
    from: zMonth('from/to must be YYYY-MM'),
    to: zMonth('from/to must be YYYY-MM'),
  })
  .refine((d) => d.from <= d.to, { message: 'from must be <= to' });

// category_id arrives as a query string; coerce to a number before the
// positive-integer check (zPositiveInt requires typeof === 'number').
export const biCategoryRangeSchema = z
  .object({
    category_id: z.preprocess(
      (v) => (typeof v === 'string' && v.trim() !== '' ? Number(v) : v),
      zPositiveInt('category_id must be a positive integer'),
    ),
    from: zMonth('from/to must be YYYY-MM'),
    to: zMonth('from/to must be YYYY-MM'),
  })
  .refine((d) => d.from <= d.to, { message: 'from must be <= to' });
