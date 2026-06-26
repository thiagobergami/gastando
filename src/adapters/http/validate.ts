import type { ZodType, ZodTypeDef } from 'zod';
import { AppError } from '../../domain/errors';

// Parse `data` against `schema`, raising the first Zod issue as an AppError(400)
// so the exact validation message flows through the error envelope unchanged.
// The input type is `unknown` so schemas that coerce/preprocess their input
// (e.g. query-string numbers) are accepted; only the output type `T` is inferred.
export function parse<T>(schema: ZodType<T, ZodTypeDef, unknown>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError(400, result.error.errors[0]?.message ?? 'invalid request');
  }
  return result.data;
}
