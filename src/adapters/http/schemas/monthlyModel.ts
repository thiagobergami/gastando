import { z } from 'zod';
import { zMonth, zNonNegInt } from './common';

// `income_cents`/`fixed_costs_cents` não entram mais aqui: o servidor os
// calcula a partir de `model_items` (design 2026-08-14, "Cálculo do total no
// servidor"). Campos extras no corpo (ex.: um cliente antigo ainda mandando
// os dois números) são descartados pelo `strip` padrão do Zod — não quebram,
// só não têm efeito.
export const putMonthlyModelSchema = z.object({
  month: zMonth('month must be YYYY-MM'),
  savings_goal_cents: zNonNegInt('savings_goal_cents must be a non-negative integer'),
});
