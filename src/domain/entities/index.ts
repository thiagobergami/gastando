export interface Group {
  id: number;
  name: string;
  color: string;
  sort_order: number;
  active: number;
}
export interface Category {
  id: number;
  group_id: number;
  name: string;
  examples: string;
  sort_order: number;
  active: number;
}
export interface Card {
  id: number;
  name: string;
  active: number;
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
