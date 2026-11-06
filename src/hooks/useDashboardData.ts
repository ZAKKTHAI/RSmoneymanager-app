import { useCallback, useEffect, useState } from "react";

import { getMonthlySummary, ApiError } from "../lib/api";
import {
  getCategoriesWithOffline,
  getTransactionsWithOffline,
} from "../lib/sync";

import type {
  Category,
  MonthlySummary,
  SummaryMode,
  Transaction,
} from "../types/api";

interface DashboardData {
  summary: MonthlySummary | null;
  categories: Category[];
  transactions: Transaction[];
  recentTransactions: Transaction[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

function getPeriod(
  year: number,
  month: number,
  mode: SummaryMode,
) {
  if (mode === "15th") {
    const start = new Date(year, month - 1, 15);
    const end = new Date(year, month, 14);

    return {
      start_date: formatDate(start),
      end_date: formatDate(end),
    };
  }

  return {
    start_date: formatDate(new Date(year, month - 1, 1)),
    end_date: formatDate(new Date(year, month, 0)),
  };
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function createLocalSummary(
  year: number,
  month: number,
  mode: SummaryMode,
  transactions: Transaction[],
  categories: Category[],
): MonthlySummary {
  const period = getPeriod(year, month, mode);

  const periodTransactions = transactions.filter(
    (transaction) =>
      transaction.date >= period.start_date &&
      transaction.date <= period.end_date,
  );

  const totalIncome = periodTransactions
    .filter((item) => item.transaction_type === "income")
    .reduce((sum, item) => sum + item.amount, 0);

  const totalExpense = periodTransactions
    .filter((item) => item.transaction_type === "expense")
    .reduce((sum, item) => sum + item.amount, 0);

  const categorySummary = categories.map((category) => ({
    category_id: category.id,
    category_name: category.name,
    total: periodTransactions
      .filter(
        (item) =>
          item.transaction_type === "expense" &&
          item.category_id === category.id,
      )
      .reduce((sum, item) => sum + item.amount, 0),
  }));

  return {
    year,
    month,
    mode,
    ...period,
    total_income: totalIncome,
    total_expense: totalExpense,
    balance: totalIncome - totalExpense,
    category_summary: categorySummary,
  };
}

export function useDashboardData(
  year: number,
  month: number,
  mode: SummaryMode = "calendar",
): DashboardData {
  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [transactionData, categoryData] = await Promise.all([
        getTransactionsWithOffline(),
        getCategoriesWithOffline(),
      ]);

      const sorted = [...transactionData].sort((a, b) =>
        b.date.localeCompare(a.date),
      );

      setTransactions(sorted);
      setCategories(categoryData);

      try {
        const summaryData = await getMonthlySummary(year, month, mode);
        setSummary(summaryData);
      } catch (summaryError) {
        if (
          summaryError instanceof ApiError &&
          summaryError.status === 0
        ) {
          setSummary(
            createLocalSummary(
              year,
              month,
              mode,
              sorted,
              categoryData,
            ),
          );
        } else {
          throw summaryError;
        }
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "データの取得に失敗しました。",
      );
    } finally {
      setLoading(false);
    }
  }, [year, month, mode]);

  useEffect(() => {
    void refresh();

    const handleSyncUpdated = () => {
      void refresh();
    };

    window.addEventListener(
      "kakeibo-sync-updated",
      handleSyncUpdated,
    );

    return () => {
      window.removeEventListener(
        "kakeibo-sync-updated",
        handleSyncUpdated,
      );
    };
  }, [refresh]);

  return {
    summary,
    categories,
    transactions,
    recentTransactions: transactions.slice(0, 5),
    loading,
    error,
    refresh,
  };
}
