import { useState, type FormEvent } from "react";
import type {
  Category,
  Transaction,
  TransactionInput,
  TransactionType,
} from "../types/api";

interface TransactionFormProps {
  categories: Category[];
  initialData?: Transaction | null;
  loading?: boolean;
  onSubmit: (data: TransactionInput) => Promise<void>;
  onCancel: () => void;
}

function getToday(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export default function TransactionForm({
  categories,
  initialData,
  loading = false,
  onSubmit,
  onCancel,
}: TransactionFormProps) {
  const [type, setType] = useState<TransactionType>(
    initialData?.transaction_type ?? "expense",
  );
  const [amount, setAmount] = useState(
    initialData ? String(initialData.amount) : "",
  );
  const [categoryId, setCategoryId] = useState(
    initialData?.category_id ?? "",
  );
  const [description, setDescription] = useState(
    initialData?.description ?? "",
  );
  const [date, setDate] = useState(initialData?.date ?? getToday());
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const parsedAmount = Number(amount);

    if (!Number.isSafeInteger(parsedAmount) || parsedAmount <= 0) {
      setError("金額は1円以上の整数で入力してください。");
      return;
    }

    if (!date) {
      setError("日付を入力してください。");
      return;
    }

    if (type === "expense" && !categoryId) {
      setError("支出カテゴリを選択してください。");
      return;
    }

    try {
      await onSubmit({
        transaction_type: type,
        amount: parsedAmount,
        category_id: type === "expense" ? categoryId : null,
        description: description.trim(),
        date,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "保存に失敗しました。",
      );
    }
  };

  return (
    <div className="transaction-form-overlay">
      <section
        className="panel transaction-form-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="transaction-form-title"
      >
        <div className="panel-heading">
          <div>
            <h3 id="transaction-form-title">
              {initialData ? "取引を編集" : "取引を登録"}
            </h3>
            <p>収入・支出の内容を入力してください。</p>
          </div>
          <button
            type="button"
            className="form-close-button"
            onClick={onCancel}
            aria-label="閉じる"
            disabled={loading}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>取引の種類</label>
            <div className="transaction-type-switch">
              <button
                type="button"
                className={type === "expense" ? "active expense" : ""}
                onClick={() => setType("expense")}
                disabled={loading}
              >
                支出
              </button>
              <button
                type="button"
                className={type === "income" ? "active income" : ""}
                onClick={() => setType("income")}
                disabled={loading}
              >
                収入
              </button>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="transaction-amount">金額（円）</label>
            <input
              id="transaction-amount"
              type="number"
              min="1"
              step="1"
              required
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="例：1200"
              disabled={loading}
            />
          </div>

          {type === "expense" && (
            <div className="form-group">
              <label htmlFor="transaction-category">カテゴリ</label>
              <select
                id="transaction-category"
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                required
                disabled={loading}
              >
                <option value="">カテゴリを選択</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="transaction-date">日付</label>
            <input
              id="transaction-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="transaction-description">メモ</label>
            <input
              id="transaction-description"
              type="text"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="例：スーパーで食材を購入"
              maxLength={500}
              disabled={loading}
            />
            <span className="form-hint">
              内容を自由に記録できます。
            </span>
          </div>

          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}

          <div className="transaction-form-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onCancel}
              disabled={loading}
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={loading}
            >
              {loading
                ? "保存中..."
                : initialData
                  ? "変更を保存"
                  : "取引を登録"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
