import { z } from 'zod';
import { zMonth, zNonNegInt } from './common';

// Os três valores são obrigatórios: gravar um modelo parcial deixaria o mês com
// um número herdado e outro explícito, e ninguém saberia dizer qual é qual.
export const putMonthlyModelSchema = z.object({
  month: zMonth('month must be YYYY-MM'),
  income_cents: zNonNegInt('income_cents must be a non-negative integer'),
  fixed_costs_cents: zNonNegInt('fixed_costs_cents must be a non-negative integer'),
  savings_goal_cents: zNonNegInt('savings_goal_cents must be a non-negative integer'),
});
