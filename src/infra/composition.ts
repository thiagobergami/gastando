import type express from 'express';
import { makeBiController } from '../adapters/http/controllers/bi';
import { makeCardsController } from '../adapters/http/controllers/cards';
import { makeCategoriesController } from '../adapters/http/controllers/categories';
import { makeDashboardController } from '../adapters/http/controllers/dashboard';
import { makeGroupsController } from '../adapters/http/controllers/groups';
import { makeInstallmentGroupsController } from '../adapters/http/controllers/installmentGroups';
import { makeLimitsController } from '../adapters/http/controllers/limits';
import { makeOnboardingController } from '../adapters/http/controllers/onboarding';
import { makeRecurringController } from '../adapters/http/controllers/recurring';
import { makeSettingsController } from '../adapters/http/controllers/settings';
import { makeSimulateController } from '../adapters/http/controllers/simulate';
import { makeTransactionsController } from '../adapters/http/controllers/transactions';
import { makeBiUseCases } from '../application/use-cases/bi';
import { makeCardUseCases } from '../application/use-cases/cards';
import { makeCategoryUseCases } from '../application/use-cases/categories';
import { makeDashboardUseCases } from '../application/use-cases/dashboard';
import { makeGroupUseCases } from '../application/use-cases/groups';
import { makeInstallmentUseCases } from '../application/use-cases/installments';
import { makeLimitUseCases } from '../application/use-cases/limits';
import { makeOnboardingUseCases } from '../application/use-cases/onboarding';
import { makeRecurringUseCases } from '../application/use-cases/recurring';
import { makeSettingsUseCases } from '../application/use-cases/settings';
import { makeSimulateUseCases } from '../application/use-cases/simulate';
import { makeTransactionUseCases } from '../application/use-cases/transactions';
import type { Db } from './db';
import { makeCardRepository } from './repositories/cards';
import { makeCategoryRepository } from './repositories/categories';
import { makeGroupRepository } from './repositories/groups';
import { makeInstallmentRepository } from './repositories/installments';
import { makeLimitRepository } from './repositories/limits';
import { makeRecurringRepository } from './repositories/recurring';
import { makeReportRepository } from './repositories/reports';
import { makeSettingsRepository } from './repositories/settings';
import { makeTransactionRepository } from './repositories/transactions';

export interface Container {
  db: Db;
  controllers: {
    groups: express.Router;
    categories: express.Router;
    cards: express.Router;
    limits: express.Router;
    transactions: express.Router;
    installmentGroups: express.Router;
    settings: express.Router;
    onboarding: express.Router;
    dashboard: express.Router;
    bi: express.Router;
    simulate: express.Router;
    recurring: express.Router;
  };
}

export function buildContainer(db: Db): Container {
  const repositories = {
    transactions: makeTransactionRepository(db),
    categories: makeCategoryRepository(db),
    cards: makeCardRepository(db),
    groups: makeGroupRepository(db),
    limits: makeLimitRepository(db),
    installments: makeInstallmentRepository(db),
    settings: makeSettingsRepository(db),
    reports: makeReportRepository(db),
    recurring: makeRecurringRepository(db),
  };

  const useCases = {
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
    categories: makeCategoryUseCases({
      categories: repositories.categories,
      groups: repositories.groups,
    }),
    groups: makeGroupUseCases({ groups: repositories.groups }),
    cards: makeCardUseCases({ cards: repositories.cards }),
    limits: makeLimitUseCases({
      limits: repositories.limits,
      categories: repositories.categories,
      reports: repositories.reports,
    }),
    settings: makeSettingsUseCases({ settings: repositories.settings }),
    onboarding: makeOnboardingUseCases({ settings: repositories.settings }),
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
      groups: repositories.groups,
      settings: repositories.settings,
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
    groups: makeGroupsController(useCases.groups),
    categories: makeCategoriesController(useCases.categories),
    cards: makeCardsController(useCases.cards),
    limits: makeLimitsController(useCases.limits),
    transactions: makeTransactionsController(useCases.transactions),
    installmentGroups: makeInstallmentGroupsController(useCases.installments),
    settings: makeSettingsController(useCases.settings),
    onboarding: makeOnboardingController(useCases.onboarding),
    dashboard: makeDashboardController(useCases.dashboard),
    bi: makeBiController(useCases.bi),
    simulate: makeSimulateController(useCases.simulate),
    recurring: makeRecurringController(useCases.recurring),
  };

  return { db, controllers };
}
