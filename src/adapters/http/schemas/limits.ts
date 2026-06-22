import { z } from 'zod';
import { zMonth, zNonNegInt } from './common';

// limit_cents must be a non-negative integer; category_id existence is enforced
// by the use-case.
export const upsertLimitSchema = z.object({
  month: zMonth('month must be YYYY-MM'),
  limit_cents: zNonNegInt('limit_cents must be a non-negative integer'),
});
