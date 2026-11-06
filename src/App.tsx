import { useEffect, useState } from "react";
import "./App.css";

import { useDashboardData } from "./hooks/useDashboardData";
import { useSync } from "./hooks/useSync";

import TransactionForm from "./components/TransactionForm";
import SyncStatus from "./components/SyncStatus";

type Page = "dashboard" | "transactions" | "settings";
type Theme = "light" | "dark";

import {
  createTransactionWithOffline,
  updateTransactionWithOffline,
  deleteTransactionWithOffline,
  getTransactionsWithOffline,
  getCategoriesWithOffline,
} from "./lib/sync";

import type {
  Category,
  Transaction,
  TransactionInput,
} from "./types/api";

const NAV_ITEMS: {
  id: Page;
  label: string;
  icon: string;
}[] = [
  { id: "dashboard", label: "ダッシュボード", icon: "◫" },
  { id: "transactions", label: "取引一覧", icon: "⇄" },
  { id: "settings", label: "設定", icon: "⚙" },
];

const formatDate = () =>
  new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());

function App() {
  const [page, setPage] = useState<Page>("dashboard");

  const sync = useSync();

  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem("kakeibo-theme") as Theme) || "light";
  });

  const [apiUrl, setApiUrl] = useState(
    () => localStorage.getItem("kakeibo-api-url") || "http://127.0.0.1:3000"
  );

  const [saved, setSaved] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("kakeibo-theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((current) => current === "light" ? "dark" : "light");
  };

  const saveSettings = () => {
    localStorage.setItem("kakeibo-api-url", apiUrl.trim());
    setSaved(true);

    void sync.syncNow();

    window.setTimeout(() => setSaved(false), 2500);
  };

  const currentTitle = NAV_ITEMS.find((item) => item.id === page)?.label;

  return (
    <div className="app-shell">
      {/* Desktop Sidebar */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">K</div>
          <div>
            <div className="brand-name">Kakeibo</div>
            <div className="brand-caption">PERSONAL FINANCE</div>
          </div>
        </div>

        <div className="nav-section-label">MENU</div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? "active" : ""}`}
              onClick={() => setPage(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
              {page === item.id && <span className="nav-indicator" />}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="connection-indicator">
            <span
              className={`status-dot ${sync.online ? "online" : "offline"}`}
            />
            <div>
              <div className="connection-title">
                {sync.online ? "API接続中" : "オフライン"}
              </div>
              <div className="connection-description">
                {sync.pending > 0
                  ? `未同期 ${sync.pending}件`
                  : sync.syncing
                    ? "同期中..."
                    : "データ同期状態"}
              </div>
            </div>
          </div>
          <div className="sidebar-version">KAKEIBO v0.1.0</div>
        </div>
      </aside>

      {/* Main */}
      <main className="main-area">
        <header className="topbar">
          <div className="topbar-heading">
            <div className="breadcrumb">Kakeibo / {currentTitle}</div>
            <h1>{currentTitle}</h1>
          </div>

          <div className="topbar-actions">
            <span className="today-label">{formatDate()}</span>
            <SyncStatus
              online={sync.online}
              pending={sync.pending}
              syncing={sync.syncing}
              error={sync.error}
              onSync={() => void sync.syncNow()}
            />
            <button
              className="theme-toggle"
              onClick={toggleTheme}
              title="テーマ切り替え"
              aria-label="テーマ切り替え"
            >
              {theme === "light" ? "☾" : "☀"}
            </button>
            <div className="user-avatar">K</div>
          </div>
        </header>

        <div className="page-content">
          {page === "dashboard" && (
            <Dashboard onNavigate={setPage} />
          )}

          {page === "transactions" && <Transactions />}

          {page === "settings" && (
            <Settings
              apiUrl={apiUrl}
              setApiUrl={setApiUrl}
              onSave={saveSettings}
              saved={saved}
            />
          )}
        </div>

        <footer className="app-footer">
          <span>Kakeibo</span>
          <span>Personal Finance Manager</span>
        </footer>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="mobile-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`mobile-nav-item ${page === item.id ? "active" : ""}`}
            onClick={() => setPage(item.id)}
          >
            <span>{item.icon}</span>
            <small>{item.label}</small>
          </button>
        ))}
      </nav>
    </div>
  );
}

function formatYen(amount: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(amount);
}

function Dashboard({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [mode, setMode] = useState<"calendar" | "15th">("calendar");

  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth() + 1;

  const currentMonth = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
  }).format(selectedDate);

  const {
    summary,
    categories,
    transactions,
    recentTransactions,
    loading,
    error,
    refresh,
  } = useDashboardData(year, month, mode);

  const changeMonth = (amount: number) => {
    setSelectedDate((current) =>
      new Date(current.getFullYear(), current.getMonth() + amount, 1),
    );
  };

  const categoryTotals = categories.map((category) => {
    const total = transactions
      .filter(
        (transaction) =>
          transaction.transaction_type === "expense" &&
          transaction.category_id === category.id &&
          summary !== null &&
          transaction.date >= summary.start_date &&
          transaction.date <= summary.end_date,
      )
      .reduce((sum, transaction) => sum + transaction.amount, 0);

    return { ...category, total };
  });

  const categoryDescriptions: Record<string, string> = {
    生活費: "食費・日用品・交通費など",
    趣味費: "ゲーム・娯楽・趣味の買い物など",
  };

  return (
    <div className="dashboard">
      <section className="welcome-section">
        <div>
          <div className="eyebrow">OVERVIEW</div>
          <h2>お金の流れを、シンプルに。</h2>
          <p>日々の収支を記録して、生活をもっと見やすく。</p>
        </div>

        <div className="month-navigation">
          <button
            type="button"
            className="month-nav-button"
            onClick={() => changeMonth(-1)}
            aria-label="前月"
          >
            ‹
          </button>
          <div className="month-badge">{currentMonth}</div>
          <button
            type="button"
            className="month-nav-button"
            onClick={() => changeMonth(1)}
            aria-label="翌月"
          >
            ›
          </button>
        </div>
      </section>

      <section className="summary-period-controls">
        <span>集計期間</span>
        <div className="period-switch">
          <button
            type="button"
            className={mode === "calendar" ? "active" : ""}
            onClick={() => setMode("calendar")}
          >
            カレンダー月
          </button>
          <button
            type="button"
            className={mode === "15th" ? "active" : ""}
            onClick={() => setMode("15th")}
          >
            15日締め
          </button>
        </div>
        {summary && (
          <span className="period-description">
            {summary.start_date} ～ {summary.end_date}
          </span>
        )}
      </section>

      {error && (
        <div className="api-error">
          <div>
            <strong>データを取得できませんでした</strong>
            <p>{error}</p>
          </div>
          <button className="text-button" onClick={() => void refresh()}>
            再試行
          </button>
        </div>
      )}

      <section className="summary-grid">
        <SummaryCard
          label="収入"
          amount={loading ? "読み込み中..." : formatYen(summary?.total_income ?? 0)}
          description="集計期間の収入合計"
          icon="↗"
          color="income"
        />
        <SummaryCard
          label="支出"
          amount={loading ? "読み込み中..." : formatYen(summary?.total_expense ?? 0)}
          description="集計期間の支出合計"
          icon="↘"
          color="expense"
        />
        <SummaryCard
          label="収支"
          amount={loading ? "読み込み中..." : formatYen(summary?.balance ?? 0)}
          description="収入 − 支出"
          icon="＝"
          color="balance"
        />
      </section>

      <section className="dashboard-grid">
        <div className="panel category-panel">
          <div className="panel-heading">
            <div>
              <h3>支出カテゴリ</h3>
              <p>カテゴリ別の支出状況</p>
            </div>
            <span className="panel-icon">▤</span>
          </div>

          {categoryTotals.map((category) => (
            <CategoryCard
              key={category.id}
              name={category.name}
              description={
                categoryDescriptions[category.name] ?? "カテゴリ別の支出"
              }
              color={category.name === "生活費" ? "blue" : "purple"}
              amount={loading ? "—" : formatYen(category.total)}
            />
          ))}

          {!loading && categories.length === 0 && (
            <div className="no-data-note">
              カテゴリが取得できませんでした。
            </div>
          )}
        </div>

        <div className="panel recent-panel">
          <div className="panel-heading">
            <div>
              <h3>最近の取引</h3>
              <p>直近の収入・支出</p>
            </div>
            <button
              className="text-button"
              onClick={() => onNavigate("transactions")}
            >
              すべて見る →
            </button>
          </div>

          {loading ? (
            <div className="empty-state">
              <strong>読み込み中...</strong>
            </div>
          ) : recentTransactions.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">⇄</div>
              <strong>取引データはありません</strong>
              <p>取引を登録すると、ここに履歴が表示されます。</p>
            </div>
          ) : (
            <div className="transaction-list">
              {recentTransactions.map((transaction) => {
                const category = categories.find(
                  (item) => item.id === transaction.category_id,
                );

                const isIncome =
                  transaction.transaction_type === "income";

                return (
                  <div className="transaction-row" key={transaction.id}>
                    <div className="transaction-main">
                      <strong>
                        {transaction.description || "メモなし"}
                      </strong>
                      <span>
                        {transaction.date}
                        {category ? ` · ${category.name}` : ""}
                      </span>
                    </div>
                    <strong
                      className={
                        isIncome
                          ? "transaction-income"
                          : "transaction-expense"
                      }
                    >
                      {isIncome ? "+" : "-"}
                      {formatYen(transaction.amount)}
                    </strong>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="info-banner">
        <div className="info-banner-icon">✦</div>
        <div>
          <strong>シンプルな家計管理</strong>
          <p>
            カテゴリは「生活費」「趣味費」の2種類。
            細かい内容はメモで自由に管理できます。
          </p>
        </div>
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  amount,
  description,
  icon,
  color,
}: {
  label: string;
  amount: string;
  description: string;
  icon: string;
  color: string;
}) {
  return (
    <div className="summary-card">
      <div className="summary-card-top">
        <span>{label}</span>
        <span className={`summary-icon ${color}`}>{icon}</span>
      </div>
      <div className="summary-amount">{amount}</div>
      <div className="summary-description">{description}</div>
    </div>
  );
}

function CategoryCard({
  name,
  description,
  color,
  amount,
}: {
  name: string;
  description: string;
  color: string;
  amount: string;
}) {
  return (
    <div className="category-card">
      <div className={`category-dot ${color}`} />
      <div className="category-info">
        <strong>{name}</strong>
        <span>{description}</span>
      </div>
      <strong className="category-amount">{amount}</strong>
    </div>
  );
}

function Transactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null);
  const [saving, setSaving] = useState(false);

  // 検索・絞り込み条件
  const [keyword, setKeyword] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const loadTransactions = async () => {
    setLoading(true);
    setError(null);

    try {
      const [transactionData, categoryData] = await Promise.all([
        getTransactionsWithOffline(),
        getCategoriesWithOffline(),
      ]);

      setTransactions(
        [...transactionData].sort((a, b) =>
          b.date.localeCompare(a.date),
        ),
      );
      setCategories(categoryData);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "取引データの取得に失敗しました。",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTransactions();

    const handleSyncUpdated = () => {
      void loadTransactions();
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
  }, []);

  const filteredTransactions = transactions.filter((transaction) => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    const matchesKeyword =
      !normalizedKeyword ||
      transaction.description.toLowerCase().includes(normalizedKeyword);

    const matchesType =
      typeFilter === "all" ||
      transaction.transaction_type === typeFilter;

    const matchesCategory =
      categoryFilter === "all" ||
      transaction.category_id === categoryFilter;

    const matchesStartDate =
      !startDate || transaction.date >= startDate;

    const matchesEndDate =
      !endDate || transaction.date <= endDate;

    return (
      matchesKeyword &&
      matchesType &&
      matchesCategory &&
      matchesStartDate &&
      matchesEndDate
    );
  });

  const resetFilters = () => {
    setKeyword("");
    setTypeFilter("all");
    setCategoryFilter("all");
    setStartDate("");
    setEndDate("");
  };


  const openCreateForm = () => {
    setEditingTransaction(null);
    setFormOpen(true);
  };

  const openEditForm = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setFormOpen(true);
  };

  const closeForm = () => {
    if (saving) return;
    setFormOpen(false);
    setEditingTransaction(null);
  };

  const handleSave = async (data: TransactionInput) => {
    setSaving(true);
    setError(null);

    try {
      if (editingTransaction) {
        await updateTransactionWithOffline(editingTransaction.id, data);
      } else {
        await createTransactionWithOffline(data);
      }

      setFormOpen(false);
      setEditingTransaction(null);
      await loadTransactions();
    } catch (err) {
      throw new Error(
        err instanceof Error
          ? err.message
          : "取引の保存に失敗しました。",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (transaction: Transaction) => {
    const confirmed = window.confirm(
      `この取引を削除しますか？\n\n` +
      `${transaction.description || "メモなし"}\n` +
      `${formatYen(transaction.amount)}`,
    );

    if (!confirmed) return;

    setError(null);

    try {
      await deleteTransactionWithOffline(transaction.id);
      await loadTransactions();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "取引の削除に失敗しました。",
      );
    }
  };

  return (
    <div className="transactions-page">
      <section className="page-intro">
        <div>
          <div className="eyebrow">TRANSACTIONS</div>
          <h2>取引一覧</h2>
          <p>収入と支出の記録を管理します。</p>

          <button
            className="primary-button"
            onClick={openCreateForm}
          >
            ＋ 取引を追加
          </button>
        </div>
      </section>

      {error && (
        <div className="api-error">
          <div>
            <strong>エラーが発生しました</strong>
            <p>{error}</p>
          </div>
          <button
            className="text-button"
            onClick={() => void loadTransactions()}
          >
            再試行
          </button>
        </div>
      )}

      <section className="panel transaction-filter-panel">
        <div className="panel-heading">
          <div>
            <h3>取引を検索</h3>
            <p>メモ・種類・カテゴリ・期間で絞り込めます。</p>
          </div>
          <button className="text-button" onClick={resetFilters}>
            条件をリセット
          </button>
        </div>

        <div className="transaction-filters">
          <div className="filter-field keyword-field">
            <label htmlFor="transaction-search">キーワード</label>
            <input
              id="transaction-search"
              type="search"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="メモを検索..."
            />
          </div>

          <div className="filter-field">
            <label htmlFor="transaction-type-filter">取引種類</label>
            <select
              id="transaction-type-filter"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
            >
              <option value="all">すべて</option>
              <option value="income">収入</option>
              <option value="expense">支出</option>
            </select>
          </div>

          <div className="filter-field">
            <label htmlFor="transaction-category-filter">カテゴリ</label>
            <select
              id="transaction-category-filter"
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
            >
              <option value="all">すべて</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-field">
            <label htmlFor="transaction-start-date">開始日</label>
            <input
              id="transaction-start-date"
              type="date"
              value={startDate}
              max={endDate || undefined}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </div>

          <div className="filter-field">
            <label htmlFor="transaction-end-date">終了日</label>
            <input
              id="transaction-end-date"
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </div>
        </div>

        <div className="filter-result-count">
          {loading
            ? "検索中..."
            : `${filteredTransactions.length} 件 / 全 ${transactions.length} 件`}
        </div>
      </section>

      <section className="panel transactions-panel">
        <div className="panel-heading">
          <div>
            <h3>取引履歴</h3>
            <p>日付の新しい順に表示しています。</p>
          </div>
          <span className="count-badge">
            {loading ? "..." : `${filteredTransactions.length} 件`}
          </span>
        </div>

        {loading ? (
          <div className="empty-state transaction-empty">
            <strong>取引データを読み込んでいます...</strong>
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="empty-state transaction-empty">
            <div className="empty-icon">▤</div>
            <strong>
              {transactions.length === 0
                ? "取引履歴はまだありません"
                : "条件に一致する取引がありません"}
            </strong>
            <p>
              {transactions.length === 0
                ? "「取引を追加」から最初の取引を登録できます。"
                : "検索条件を変更するか、リセットしてください。"}
            </p>
          </div>
        ) : (
          <div className="transaction-list">
            {filteredTransactions.map((transaction) => {
              const category = categories.find(
                (item) => item.id === transaction.category_id,
              );

              const isIncome =
                transaction.transaction_type === "income";

              return (
                <div className="transaction-row" key={transaction.id}>
                  <div className="transaction-main">
                    <strong>
                      {transaction.description || "メモなし"}
                    </strong>
                    <span>
                      {transaction.date}
                      {category ? ` · ${category.name}` : ""}
                      {isIncome ? " · 収入" : " · 支出"}
                    </span>
                  </div>

                  <div className="transaction-actions">
                    <strong
                      className={
                        isIncome
                          ? "transaction-income"
                          : "transaction-expense"
                      }
                    >
                      {isIncome ? "+" : "-"}
                      {formatYen(transaction.amount)}
                    </strong>

                    <button
                      type="button"
                      className="icon-action-button"
                      onClick={() => openEditForm(transaction)}
                      aria-label="取引を編集"
                      title="編集"
                    >
                      ✎
                    </button>

                    <button
                      type="button"
                      className="icon-action-button delete"
                      onClick={() => void handleDelete(transaction)}
                      aria-label="取引を削除"
                      title="削除"
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {formOpen && (
        <TransactionForm
          key={editingTransaction?.id ?? "new"}
          categories={categories}
          initialData={editingTransaction}
          loading={saving}
          onSubmit={handleSave}
          onCancel={closeForm}
        />
      )}
    </div>
  );
}

function Settings({
  apiUrl,
  setApiUrl,
  onSave,
  saved,
}: {
  apiUrl: string;
  setApiUrl: (value: string) => void;
  onSave: () => void;
  saved: boolean;
}) {
  return (
    <div className="settings-page">
      <section className="page-intro">
        <div>
          <div className="eyebrow">PREFERENCES</div>
          <h2>設定</h2>
          <p>アプリケーションの接続設定を管理します。</p>
        </div>
      </section>

      <section className="panel settings-panel">
        <div className="settings-heading">
          <div className="settings-icon">⌘</div>
          <div>
            <h3>API接続設定</h3>
            <p>家計簿APIサーバーの接続先を指定します。</p>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="api-url">API Base URL</label>
          <input
            id="api-url"
            type="url"
            value={apiUrl}
            onChange={(event) => setApiUrl(event.target.value)}
            placeholder="http://127.0.0.1:3000"
          />
          <span className="form-hint">
            Windows・Linux・Androidそれぞれの接続環境に合わせて指定してください。
          </span>
        </div>

        <div className="settings-actions">
          <span className="save-feedback">
            {saved ? "✓ 設定を保存しました" : ""}
          </span>
          <button className="primary-button" onClick={onSave}>
            設定を保存
          </button>
        </div>
      </section>

      <section className="panel about-panel">
        <h3>アプリ情報</h3>
        <div className="about-row">
          <span>アプリケーション</span>
          <strong>Kakeibo</strong>
        </div>
        <div className="about-row">
          <span>バージョン</span>
          <strong>0.1.0</strong>
        </div>
        <div className="about-row">
          <span>フレームワーク</span>
          <strong>Tauri 2 / React</strong>
        </div>
      </section>
    </div>
  );
}

export default App;
