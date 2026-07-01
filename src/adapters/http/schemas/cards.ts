import { z } from 'zod';

const dayOrNull = z.custom<number | null>(
  v => v === null || v === undefined || (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 31),
  { message: 'day must be an integer 1..31 or null' });

export const statementConfigSchema = z.object({ closing_day: dayOrNull, due_day: dayOrNull });
