import type { ZodType } from 'zod';
import { AppError } from '../../domain/errors';

// Parse `data` against `schema`, raising the first Zod issue as an AppError(400)
// so the exact validation message flows through the error envelope unchanged.
export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError(400, result.error.errors[0]?.message ?? 'invalid request');
  }
  return result.data;
}
