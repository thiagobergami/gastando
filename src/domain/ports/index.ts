import type {
  Card,
  Category,
  Group,
  InstallmentProgress,
  RecurringTemplate,
  Transaction,
} from '../entities';

export interface GroupRepository {
  listActive(): Group[];
  listAll(): Group[]; // all groups (active + inactive), for BI by-group
  findById(id: number): Group | undefined;
  findActiveById(id: number): Group | undefined;
  nextSortOrder(): number;
  insert(g: { name: string; color: string; sort_order: number }): Group;
  update(id: number, g: { name: string; color: string; sort_order: number }): number; // changes
  countActiveCategories(groupId: number): number;
  deactivate(id: number): number; // changes (active=1 guard)
}

export interface CategoryRepository {
  listAll(): Category[]; // ORDER BY sort_order, id
  listActive(): Category[];
  listActiveIds(): number[]; // SELECT id WHERE active=1 (insertion order; for GET /api/limits)
  findById(id: number): Category | undefined;
  nextSortOrder(): number; // MAX(sort_order)+1 WHERE active=1
  insert(c: { group_id: number; name: string; examples: string; sort_order: number }): Category;
  update(
    id: number,
    c: { group_id: number; name: string; examples: string; sort_order: number; active: number },
  ): number;
  deactivate(id: number): number;
}

export interface CardRepository {
  listAll(): Card[]; // ORDER BY id
  findById(id: number): Card | undefined;
  insert(c: { name: string }): Card;
  update(id: number, c: { name: string; active: number }): number;
  deactivate(id: number): number;
  setStatementConfig(id: number, closingDay: number | null, dueDay: number | null): number;
}

export interface TransactionFilter {
  month?: string;
  categoryId?: number;
  cardId?: number;
  q?: string;
}
export interface TransactionPage extends TransactionFilter {
  limit?: number | null;
  offset?: number;
}

export interface TransactionRepository {
  list(p: TransactionPage): Transaction[];
  count(f: TransactionFilter): number;
  findById(id: number): Transaction | undefined;
  insert(t: {
    date: string;
    category_id: number;
    card_id: number;
    amount_cents: number;
    description: string;
  }): Transaction;
  update(
    id: number,
    t: {
      date: string;
      category_id: number;
      card_id: number;
      amount_cents: number;
      description: string;
    },
  ): number;
  remove(id: number): number;
  firstByGroup(groupId: number): Transaction | undefined;
}

export interface LimitRepository {
  resolve(categoryId: number, month: string): number; // carry-forward pick, 0 if none
  upsert(categoryId: number, month: string, limitCents: number): void;
  sumSpend(categoryId: number, month: string): number;
  firstTxMonth(categoryId: number): string | null;
}

export interface InstallmentRepository {
  // atomic: insert group + N child transactions; returns new group id
  createPurchase(p: {
    category_id: number;
    card_id: number;
    description: string;
    total_cents: number;
    count: number;
    first_month: string;
  }): number;
  remove(id: number): void; // throws AppError(404) if absent
  listWithProgress(asOfMonth: string): InstallmentProgress[];
  update(
    id: number,
    p: {
      category_id: number;
      card_id: number;
      description?: string;
      total_cents: number;
      count: number;
      first_month: string;
    },
  ): void; // atomic re-expand; throws AppError(404) if absent
  payOffEarly(id: number, asOfMonth: string): void; // re-date remaining parcelas to asOf; 404/400
}

export interface SettingsRepository {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  setMany(entries: [string, string][]): void; // atomic
  countTransactions(): number;
  countInstallmentGroups(): number;
  wipeCategoryData(): void; // atomic: delete limits, categories, groups
}

export interface RecurringRepository {
  list(): RecurringTemplate[];
  listActive(): RecurringTemplate[];
  findById(id: number): RecurringTemplate | undefined;
  insert(t: {
    description: string;
    category_id: number;
    card_id: number;
    amount_cents: number;
    day_of_month: number;
  }): RecurringTemplate;
  update(
    id: number,
    t: {
      description: string;
      category_id: number;
      card_id: number;
      amount_cents: number;
      day_of_month: number;
      active: number;
    },
  ): number;
  deactivate(id: number): number;
  findChargeForMonth(templateId: number, month: string): boolean;
  insertCharge(c: {
    template_id: number;
    date: string;
    category_id: number;
    card_id: number;
    amount_cents: number;
    description: string;
  }): number;
  lastChargeAmountBefore(templateId: number, month: string): number | null;
}

export interface ReportRepository {
  spendByCategoryMonth(categoryId: number, month: string): number;
  spendByCardMonth(cardId: number, month: string): number;
  spendByGroupMonth(groupId: number, month: string): number;
  spendAllMonth(month: string): number;
  installmentSpendMonth(month: string): number;
  dashboardCategories(): Array<
    Category & { group_name: string; group_color: string; group_sort: number }
  >;
}
