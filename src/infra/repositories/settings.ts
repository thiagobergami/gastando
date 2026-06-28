import type { Db } from '../db';
import type { SettingsRepository } from '../../domain/ports';

const UPSERT_SQL =
  'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value';

export function makeSettingsRepository(db: Db): SettingsRepository {
  return {
    get(key: string): string | undefined {
      const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key) as
        | { value: string }
        | undefined;
      return row ? row.value : undefined;
    },
    set(key: string, value: string): void {
      db.prepare(UPSERT_SQL).run(key, value);
    },
    setMany(entries: [string, string][]): void {
      const upsert = db.prepare(UPSERT_SQL);
      db.transaction(() => {
        for (const [k, v] of entries) upsert.run(k, v);
      })();
    },
    countTransactions(): number {
      return (db.prepare('SELECT COUNT(*) AS n FROM transactions').get() as { n: number }).n;
    },
    countInstallmentGroups(): number {
      return (db.prepare('SELECT COUNT(*) AS n FROM installment_groups').get() as { n: number }).n;
    },
    wipeCategoryData(): void {
      db.transaction(() => {
        db.prepare('DELETE FROM category_limits').run();
        db.prepare('DELETE FROM categories').run();
        db.prepare('DELETE FROM groups').run();
      })();
    },
  };
}
