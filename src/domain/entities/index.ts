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
