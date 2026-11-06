import type {
  Category,
  MonthlySummary,
  SummaryMode,
  Transaction,
  TransactionInput,
} from "../types/api";

const DEFAULT_API_URL = "http://127.0.0.1:3000";
const API_URL_KEY = "kakeibo-api-url";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function getApiBaseUrl(): string {
  const savedUrl = localStorage.getItem(API_URL_KEY);

  return (savedUrl || DEFAULT_API_URL).replace(/\/+$/, "");
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const baseUrl = getApiBaseUrl();

  let response: Response;

  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError(
      "APIサーバーに接続できません。サーバーの起動状態とAPI URLを確認してください。",
      0,
    );
  }

  if (!response.ok) {
    let message = `APIエラー (${response.status})`;

    try {
      const body = await response.json();
      if (typeof body.error === "string") {
        message = body.error;
      }
    } catch {
      // エラーレスポンスがJSONでない場合は既定メッセージを使用
    }

    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

// カテゴリ一覧
export function getCategories(): Promise<Category[]> {
  return request<Category[]>("/api/categories");
}

// 取引一覧
export function getTransactions(): Promise<Transaction[]> {
  return request<Transaction[]>("/api/transactions");
}

// 取引詳細
export function getTransaction(id: string): Promise<Transaction> {
  return request<Transaction>(
    `/api/transactions/${encodeURIComponent(id)}`,
  );
}

// 取引登録
export function createTransaction(
  data: TransactionInput,
): Promise<Transaction> {
  return request<Transaction>("/api/transactions", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// 取引更新
export function updateTransaction(
  id: string,
  data: TransactionInput,
): Promise<Transaction> {
  return request<Transaction>(
    `/api/transactions/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      body: JSON.stringify(data),
    },
  );
}

// 取引削除
export function deleteTransaction(id: string): Promise<void> {
  return request<void>(
    `/api/transactions/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    },
  );
}

// 月次集計
export function getMonthlySummary(
  year: number,
  month: number,
  mode: SummaryMode = "calendar",
): Promise<MonthlySummary> {
  const params = new URLSearchParams({
    year: String(year),
    month: String(month),
    mode,
  });

  return request<MonthlySummary>(
    `/api/summary/monthly?${params.toString()}`,
  );
}
