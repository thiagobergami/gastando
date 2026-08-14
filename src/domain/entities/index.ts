export interface Group {
  id: number;
  name: string;
  color: string;
  sort_order: number;
  active: number;
}
// categories.group_id continua NOT NULL REFERENCES groups(id) no schema, mas
// grupos saíram da UI e da API na v0.3: toda categoria aponta para o sentinela.
export const NO_GROUP_ID = 0;

export interface Category {
  id: number;
  group_id: number;
  name: string;
  examples: string;
  sort_order: number;
  active: number;
  essential: number; // 0 | 1
}
export interface Card {
  id: number;
  name: string;
  active: number;
  closing_day: number | null;
  due_day: number | null;
}
export interface CategoryLimit {
  id: number;
  category_id: number;
  month: string;
  limit_cents: number;
}
export interface InstallmentGroup {
  id: number;
  description: string;
  total_cents: number;
  total_count: number;
  first_month: string;
  category_id: number;
  card_id: number;
}
export interface InstallmentProgress {
  id: number;
  description: string;
  category_id: number;
  card_id: number;
  category_name: string;
  card_name: string;
  total_cents: number;
  total_count: number;
  first_month: string;
  paid_count: number;
  remaining_count: number;
  paid_cents: number;
  remaining_cents: number;
  monthly_cents: number;
  next_month: string | null;
}
export interface Transaction {
  id: number;
  date: string;
  category_id: number;
  card_id: number;
  amount_cents: number;
  description: string;
  installment_group_id: number | null;
  installment_no: number | null;
  installment_total: number | null;
}
export interface RecurringTemplate {
  id: number;
  description: string;
  category_id: number;
  card_id: number;
  amount_cents: number;
  day_of_month: number;
  active: number;
}

// Uma linha por mês, espelhando `category_limits`: o modelo de poupança passa a
// ter história (v0.3 §9 passo 3).
export interface MonthlyModel {
  month: string;
  income_cents: number;
  fixed_costs_cents: number;
  savings_goal_cents: number;
}

// `source` diz de qual degrau da cadeia de fallback o valor veio. É o que torna
// o teste dos três degraus legível, e o que permite à UI dizer "herdado de".
export interface ResolvedModel extends MonthlyModel {
  source: 'month' | 'carry' | 'settings' | 'none';
}

// Duas listas paralelas, desconectadas de `recurring_templates`/`transactions`
// (design 2026-08-14 "Summary"): o total gravado em `monthly_model` na
// revisão mensal passa a ser a soma dos itens de cada `kind`, não mais um
// número solto digitado à mão.
export interface ModelItem {
  id: number;
  kind: 'income' | 'fixed_cost';
  name: string;
  amount_cents: number;
  sort_order: number;
}

// Quem participa de um split de transação (design 2026-08-14 "Data model").
// Soft-delete via `active`, como `categories`/`cards`: uma transação antiga
// continua resolvendo o nome mesmo depois que a pessoa é removida.
export interface Person {
  id: number;
  name: string;
  active: number; // 0 | 1
}
