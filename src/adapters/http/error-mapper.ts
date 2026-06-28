import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import type { AppError } from '../../domain/errors';

// Maps thrown errors to the frozen { error } envelope. ZodError -> first issue
// message at 400; AppError / legacy status-tagged errors -> their status;
// anything else -> 500 with a generic message (and a server-side log).
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: err.errors[0]?.message ?? 'invalid request' });
  }
  const status = (err as AppError)?.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: (err as Error)?.message || 'Internal error' });
}
