import type { SettingsRepository } from '../../domain/ports';

export interface SettingsUseCaseDeps { settings: SettingsRepository; }

export const SETTINGS_KEYS = ['monthly_income', 'fixed_costs', 'savings_goal'] as const;
export type SettingsValues = Record<(typeof SETTINGS_KEYS)[number], number>;

export function makeSettingsUseCases(deps: SettingsUseCaseDeps) {
  const { settings } = deps;

  function readAll(): SettingsValues {
    const out = {} as SettingsValues;
    for (const k of SETTINGS_KEYS) {
      const v = settings.get(k);
      out[k] = v !== undefined ? Number(v) : 0;
    }
    return out;
  }

  return {
    get(): SettingsValues {
      return readAll();
    },
    update(body: Record<string, unknown>): SettingsValues {
      const entries = SETTINGS_KEYS
        .filter(k => body[k] !== undefined)
        .map(k => [k, String(Math.trunc(body[k] as number))] as [string, string]);
      settings.setMany(entries);
      return readAll();
    },
  };
}
