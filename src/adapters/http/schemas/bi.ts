import { z } from 'zod';
import { zMonth } from './common';

export const biRangeSchema = z.object({
  from: zMonth('from/to must be YYYY-MM'),
  to: zMonth('from/to must be YYYY-MM'),
}).refine(d => d.from <= d.to, { message: 'from must be <= to' });
