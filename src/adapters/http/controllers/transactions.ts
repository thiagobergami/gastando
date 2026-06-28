import express from 'express';
import type { makeTransactionUseCases } from '../../../application/use-cases/transactions';
import { AppError } from '../../../domain/errors';
import { MONTH_RE } from '../schemas/common';
import {
  installmentTransactionSchema,
  singleTransactionSchema,
  updateTransactionSchema,
} from '../schemas/transactions';
import { parse } from '../validate';

type TransactionUseCases = ReturnType<typeof makeTransactionUseCases>;

export function makeTransactionsController(uc: TransactionUseCases): express.Router {
  const router = express.Router();

  router.get('/', (req, res) => {
    const { month, category_id, card_id } = req.query;
    const page: Record<string, unknown> = {};
    if (month !== undefined) {
      if (!MONTH_RE.test(String(month))) throw new AppError(400, 'month must be YYYY-MM');
      page.month = month;
    }
    if (category_id !== undefined) page.categoryId = Number(category_id);
    if (card_id !== undefined) page.cardId = Number(card_id);

    page.limit = null;
    page.offset = 0;
    if (req.query.limit !== undefined) {
      page.limit = Number(req.query.limit);
      if (!Number.isInteger(page.limit) || (page.limit as number) < 1)
        throw new AppError(400, 'limit must be a positive integer');
    }
    if (req.query.offset !== undefined) {
      page.offset = Number(req.query.offset);
      if (!Number.isInteger(page.offset) || (page.offset as number) < 0)
        throw new AppError(400, 'offset must be a non-negative integer');
    }

    const { total, items } = uc.list(page as any);
    res.set('X-Total-Count', String(total));
    res.json(items);
  });

  router.post('/', (req, res) => {
    const isInstallment =
      req.body.installment_count !== undefined || req.body.installment_total_cents !== undefined;
    if (isInstallment) parse(installmentTransactionSchema, req.body);
    else parse(singleTransactionSchema, req.body);
    res.status(201).json(uc.create(req.body));
  });

  router.put('/:id', (req, res) => {
    parse(updateTransactionSchema, req.body);
    res.json(uc.update(Number(req.params.id), req.body));
  });

  router.delete('/:id', (req, res) => {
    uc.remove(Number(req.params.id));
    res.status(204).end();
  });

  return router;
}
