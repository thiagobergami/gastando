import { z } from 'zod';

export const MONTH_RE = /^\d{4}-\d{2}$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Field-specific message factories mirroring the legacy validate.js predicates,
// so each schema emits the exact message the HTTP contract (and tests) expect.
export const zMonth = (message: string): z.ZodType<string> =>
  z.custom<string>((v) => typeof v === 'string' && MONTH_RE.test(v), { message });

export const zDate = (message: string): z.ZodType<string> =>
  z.custom<string>((v) => typeof v === 'string' && DATE_RE.test(v), { message });

export const zPositiveInt = (message: string): z.ZodType<number> =>
  z.custom<number>((v) => typeof v === 'number' && Number.isInteger(v) && v > 0, { message });

export const zNonNegInt = (message: string): z.ZodType<number> =>
  z.custom<number>((v) => typeof v === 'number' && Number.isInteger(v) && v >= 0, { message });

// Mirrors the legacy `if (!name) fail(400, 'name is required')` guard (rejects
// empty string / undefined / any falsy value) used by groups/categories/cards.
export const nameBodySchema = z.object({
  name: z.custom<string>((v) => !!v, { message: 'name is required' }),
});

// Shared `?month=YYYY-MM` query validation (limits GET, dashboard GET).
export const monthQuerySchema = z.object({
  month: zMonth('month must be YYYY-MM'),
});
