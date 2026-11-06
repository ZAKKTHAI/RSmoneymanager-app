export type TransactionType = "income" | "expense";
export type SummaryMode = "calendar" | "15th";

export interface Category {
  id: string;
  name: string;
}

export interface Transaction {
  id: string;
  transaction_type: TransactionType;
  amount: number;
  category_id: string | null;
  description: string;
  date: string;
}

export interface TransactionInput {
  transaction_type: TransactionType;
  amount: number;
  category_id: string | null;
  description: string;
  date: string;
}

export interface CategorySummary {
  category_id: string;
  category_name: string;
  total: number;
}

export interface MonthlySummary {
  year: number;
  month: number;
  mode: SummaryMode;
  start_date: string;
  end_date: string;
  total_income: number;
  total_expense: number;
  balance: number;
  category_summary: CategorySummary[];
}
