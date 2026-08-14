import type express from 'express';
import { makeBackupController } from '../adapters/http/controllers/backup';
import { makeBiController } from '../adapters/http/controllers/bi';
import { makeCardsController } from '../adapters/http/controllers/cards';
import { makeCategoriesController } from '../adapters/http/controllers/categories';
import { makeDashboardController } from '../adapters/http/controllers/dashboard';
import { makeInstallmentGroupsController } from '../adapters/http/controllers/installmentGroups';
import { makeLimitsController } from '../adapters/http/controllers/limits';
import { makeModelItemsController } from '../adapters/http/controllers/modelItems';
import { makeMonthlyModelController } from '../adapters/http/controllers/monthlyModel';
import { makePeopleController } from '../adapters/http/controllers/people';
import { makeRecurringController } from '../adapters/http/controllers/recurring';
import { makeSettingsController } from '../adapters/http/controllers/settings';
import { makeSimulateController } from '../adapters/http/controllers/simulate';
import { makeTransactionsController } from '../adapters/http/controllers/transactions';
import { makeBiUseCases } from '../application/use-cases/bi';
import { makeCardUseCases } from '../application/use-cases/cards';
import { makeCategoryUseCases } from '../application/use-cases/categories';
import { makeDashboardUseCases } from '../application/use-cases/dashboard';
import { makeInstallmentUseCases } from '../application/use-cases/installments';
import { makeLimitUseCases } from '../application/use-cases/limits';
import { makeModelUseCases } from '../application/use-cases/model';
import { makeModelItemUseCases } from '../application/use-cases/modelItems';
import { makePersonUseCases } from '../application/use-cases/people';
import { makeRecurringUseCases } from '../application/use-cases/recurring';
import { makeSettingsUseCases } from '../application/use-cases/settings';
import { makeSimulateUseCases } from '../application/use-cases/simulate';
import { makeTransactionUseCases } from '../application/use-cases/transactions';
import type { Db } from './db';
import { makeCardRepository } from './repositories/cards';
import { makeCategoryRepository } from './repositories/categories';
import { makeInstallmentRepository } from './repositories/installments';
import { makeLimitRepository } from './repositories/limits';
import { makeModelItemRepository } from './repositories/modelItems';
import { makeMonthlyModelRepository } from './repositories/monthlyModel';
import { makePersonRepository } from './repositories/people';
import { makeRecurringRepository } from './repositories/recurring';
import { makeReportRepository } from './repositories/reports';
import { makeSettingsRepository } from './repositories/settings';
import { makeTransactionRepository } from './repositories/transactions';

export interface Container {
  db: Db;
  controllers: {
    categories: express.Router;
    cards: express.Router;
    limits: express.Router;
    monthlyModel: express.Router;
    modelItems: express.Router;
    people: express.Router;
    transactions: express.Router;
    installmentGroups: express.Router;
    settings: express.Router;
    dashboard: express.Router;
    bi: express.Router;
    simulate: express.Router;
    recurring: express.Router;
    backup: express.Router;
  };
}

export function buildContainer(db: Db): Container {
  const repositories = {
    transactions: makeTransactionRepository(db),
    categories: makeCategoryRepository(db),
    cards: makeCardRepository(db),
    limits: makeLimitRepository(db),
    monthlyModel: makeMonthlyModelRepository(db),
    modelItems: makeModelItemRepository(db),
    people: makePersonRepository(db),
    installments: makeInstallmentRepository(db),
    settings: makeSettingsRepository(db),
    reports: makeReportRepository(db),
    recurring: makeRecurringRepository(db),
  };

  // Nasce fora do objeto: o BI depende dele (Task 4), e `useCases.model` ainda
  // não existe enquanto `useCases` está sendo construído.
  const model = makeModelUseCases({
    monthlyModel: repositories.monthlyModel,
    settings: repositories.settings,
    modelItems: repositories.modelItems,
  });

  const useCases = {
    model,
    modelItems: makeModelItemUseCases({ modelItems: repositories.modelItems }),
    people: makePersonUseCases({ people: repositories.people }),
    transactions: makeTransactionUseCases({
      transactions: repositories.transactions,
      categories: repositories.categories,
      cards: repositories.cards,
      installments: repositories.installments,
    }),
    installments: makeInstallmentUseCases({
      installments: repositories.installments,
      categories: repositories.categories,
      cards: repositories.cards,
    }),
    categories: makeCategoryUseCases({ categories: repositories.categories }),
    cards: makeCardUseCases({ cards: repositories.cards, reports: repositories.reports }),
    limits: makeLimitUseCases({
      limits: repositories.limits,
      categories: repositories.categories,
      reports: repositories.reports,
    }),
    settings: makeSettingsUseCases({ settings: repositories.settings }),
    dashboard: makeDashboardUseCases({
      reports: repositories.reports,
      limits: repositories.limits,
      settings: repositories.settings,
    }),
    bi: makeBiUseCases({
      reports: repositories.reports,
      limits: repositories.limits,
      categories: repositories.categories,
      cards: repositories.cards,
      settings: repositories.settings,
      model,
    }),
    simulate: makeSimulateUseCases({
      categories: repositories.categories,
      limits: repositories.limits,
    }),
    recurring: makeRecurringUseCases({
      recurring: repositories.recurring,
      categories: repositories.categories,
      cards: repositories.cards,
    }),
  };

  const controllers = {
    categories: makeCategoriesController(useCases.categories),
    cards: makeCardsController(useCases.cards),
    limits: makeLimitsController(useCases.limits),
    monthlyModel: makeMonthlyModelController(useCases.model),
    modelItems: makeModelItemsController(useCases.modelItems),
    people: makePeopleController(useCases.people),
    transactions: makeTransactionsController(useCases.transactions),
    installmentGroups: makeInstallmentGroupsController(useCases.installments),
    settings: makeSettingsController(useCases.settings),
    dashboard: makeDashboardController(useCases.dashboard),
    bi: makeBiController(useCases.bi),
    simulate: makeSimulateController(useCases.simulate),
    recurring: makeRecurringController(useCases.recurring),
    backup: makeBackupController(db),
  };

  return { db, controllers };
}
