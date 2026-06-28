import { AppError } from '../../domain/errors';
import type { SettingsRepository } from '../../domain/ports';

export interface OnboardingUseCaseDeps {
  settings: SettingsRepository;
}

const KEY = 'onboarding_complete';

export function makeOnboardingUseCases(deps: OnboardingUseCaseDeps) {
  const { settings } = deps;

  const isComplete = (): boolean => settings.get(KEY) === '1';

  return {
    status(): { complete: boolean } {
      return { complete: isComplete() };
    },
    complete(): { complete: boolean } {
      settings.set(KEY, '1');
      return { complete: true };
    },
    applyTemplate(template: unknown): { template: string } {
      if (isComplete()) throw new AppError(409, 'onboarding already complete');
      if (template !== 'suggested' && template !== 'blank')
        throw new AppError(400, 'invalid template');
      if (settings.countTransactions() > 0 || settings.countInstallmentGroups() > 0) {
        throw new AppError(409, 'cannot reset after data exists');
      }
      if (template === 'blank') settings.wipeCategoryData();
      return { template };
    },
  };
}
