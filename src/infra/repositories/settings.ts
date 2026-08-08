import type { SettingsRepository } from '../../domain/ports';
import type { Db } from '../db';

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
  };
}
