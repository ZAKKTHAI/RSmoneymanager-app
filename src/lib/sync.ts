import {
  ApiError,
  getTransactions as apiGetTransactions,
  getCategories as apiGetCategories,
  createTransaction as apiCreateTransaction,
  updateTransaction as apiUpdateTransaction,
  deleteTransaction as apiDeleteTransaction,
} from "./api";

import type {
  Category,
  Transaction,
  TransactionInput,
} from "../types/api";

import type {
  PendingOperation,
  SyncResult,
} from "../types/sync";

const QUEUE_KEY = "kakeibo-pending-operations";
const TRANSACTIONS_CACHE_KEY = "kakeibo-transactions-cache";
const CATEGORIES_CACHE_KEY = "kakeibo-categories-cache";

let syncing = false;

function readJson<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

function notifySyncChanged(): void {
  window.dispatchEvent(new Event("kakeibo-sync-updated"));
}

function createOperationId(): string {
  return crypto.randomUUID();
}

function isNetworkError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 0;
}

function readQueue(): PendingOperation[] {
  return readJson<PendingOperation[]>(QUEUE_KEY, []);
}

function writeQueue(queue: PendingOperation[]): void {
  writeJson(QUEUE_KEY, queue);
  notifySyncChanged();
}

function readTransactionCache(): Transaction[] {
  return readJson<Transaction[]>(TRANSACTIONS_CACHE_KEY, []);
}

function writeTransactionCache(transactions: Transaction[]): void {
  writeJson(TRANSACTIONS_CACHE_KEY, transactions);
}

function readCategoryCache(): Category[] {
  return readJson<Category[]>(CATEGORIES_CACHE_KEY, []);
}

function writeCategoryCache(categories: Category[]): void {
  writeJson(CATEGORIES_CACHE_KEY, categories);
}

export function getPendingCount(): number {
  return readQueue().length;
}

export function getCachedTransactions(): Transaction[] {
  return readTransactionCache();
}

function sameData(
  transaction: Transaction,
  data: TransactionInput,
): boolean {
  return (
    transaction.transaction_type === data.transaction_type &&
    transaction.amount === data.amount &&
    transaction.category_id === data.category_id &&
    transaction.description === data.description &&
    transaction.date === data.date
  );
}

function toLocalTransaction(
  id: string,
  data: TransactionInput,
): Transaction {
  return {
    id,
    ...data,
  };
}

/**
 * サーバーのデータに未同期操作を反映する。
 * サーバーを基準にしつつ、ローカル操作を画面に表示する。
 */
function applyPendingOperations(
  serverTransactions: Transaction[],
  queue: PendingOperation[],
): Transaction[] {
  let result = [...serverTransactions];

  for (const operation of queue) {
    if (operation.type === "create") {
      result = result.filter(
        (item) => item.id !== operation.local_id,
      );

      result.push(
        toLocalTransaction(operation.local_id, operation.data),
      );
    }

    if (operation.type === "update") {
      result = result.map((item) =>
        item.id === operation.transaction_id
          ? { ...item, ...operation.data }
          : item,
      );
    }

    if (operation.type === "delete") {
      result = result.filter(
        (item) => item.id !== operation.transaction_id,
      );
    }
  }

  return result.sort((a, b) => b.date.localeCompare(a.date));
}

// --------------------------------------------------
// 画面表示用データ取得
// --------------------------------------------------

export async function getTransactionsWithOffline(): Promise<Transaction[]> {
  const queue = readQueue();

  try {
    const serverTransactions = await apiGetTransactions();

    writeTransactionCache(serverTransactions);

    return applyPendingOperations(serverTransactions, queue);
  } catch (error) {
    if (!isNetworkError(error)) {
      throw error;
    }

    return applyPendingOperations(readTransactionCache(), queue);
  }
}

export async function getCategoriesWithOffline(): Promise<Category[]> {
  try {
    const categories = await apiGetCategories();
    writeCategoryCache(categories);
    return categories;
  } catch (error) {
    if (!isNetworkError(error)) {
      throw error;
    }

    return readCategoryCache();
  }
}

// --------------------------------------------------
// キュー操作
// --------------------------------------------------

function enqueueCreate(data: TransactionInput): Transaction {
  const localId = `local:${createOperationId()}`;

  const operation: PendingOperation = {
    operation_id: createOperationId(),
    type: "create",
    local_id: localId,
    data,
    created_at: new Date().toISOString(),
  };

  writeQueue([...readQueue(), operation]);

  const transactions = readTransactionCache();
  writeTransactionCache([
    ...transactions,
    toLocalTransaction(localId, data),
  ]);

  return toLocalTransaction(localId, data);
}

function enqueueUpdate(
  id: string,
  data: TransactionInput,
): Transaction {
  const queue = readQueue();

  // オフラインで作成した取引なら、CREATE自体を更新する
  const pendingCreate = queue.find(
    (item) => item.type === "create" && item.local_id === id,
  );

  if (pendingCreate && pendingCreate.type === "create") {
    pendingCreate.data = data;
    writeQueue(queue);
  } else {
    const filtered = queue.filter(
      (item) =>
        !(item.type === "update" && item.transaction_id === id),
    );

    filtered.push({
      operation_id: createOperationId(),
      type: "update",
      transaction_id: id,
      data,
      created_at: new Date().toISOString(),
    });

    writeQueue(filtered);
  }

  const transactions = readTransactionCache();
  const updated = transactions.map((item) =>
    item.id === id ? { ...item, ...data } : item,
  );

  if (!updated.some((item) => item.id === id)) {
    updated.push(toLocalTransaction(id, data));
  }

  writeTransactionCache(updated);

  return toLocalTransaction(id, data);
}

function enqueueDelete(id: string): void {
  const queue = readQueue();

  // まだサーバーに存在しない取引ならCREATEごと取り消す
  const isPendingCreate = queue.some(
    (item) => item.type === "create" && item.local_id === id,
  );

  if (isPendingCreate) {
    writeQueue(
      queue.filter(
        (item) => !(item.type === "create" && item.local_id === id),
      ),
    );
  } else {
    const filtered = queue.filter(
      (item) =>
        !(item.type === "update" && item.transaction_id === id) &&
        !(item.type === "delete" && item.transaction_id === id),
    );

    filtered.push({
      operation_id: createOperationId(),
      type: "delete",
      transaction_id: id,
      created_at: new Date().toISOString(),
    });

    writeQueue(filtered);
  }

  writeTransactionCache(
    readTransactionCache().filter((item) => item.id !== id),
  );
}

// --------------------------------------------------
// CRUD：オンラインならサーバー、通信不能ならローカル
// --------------------------------------------------

export async function createTransactionWithOffline(
  data: TransactionInput,
): Promise<Transaction> {
  try {
    const created = await apiCreateTransaction(data);

    const transactions = readTransactionCache();
    writeTransactionCache([
      ...transactions.filter((item) => item.id !== created.id),
      created,
    ]);

    return created;
  } catch (error) {
    if (!isNetworkError(error)) {
      throw error;
    }

    return enqueueCreate(data);
  }
}

export async function updateTransactionWithOffline(
  id: string,
  data: TransactionInput,
): Promise<Transaction> {
  const queue = readQueue();

  const hasPendingOperation = queue.some(
    (item) =>
      (item.type === "create" && item.local_id === id) ||
      (item.type === "update" && item.transaction_id === id),
  );

  // 未同期操作がある場合はキュー側を更新する
  if (id.startsWith("local:") || hasPendingOperation) {
    const updated = enqueueUpdate(id, data);

    if (navigator.onLine) {
      void syncPendingOperations();
    }

    return updated;
  }

  try {
    const updated = await apiUpdateTransaction(id, data);

    writeTransactionCache([
      ...readTransactionCache().filter((item) => item.id !== id),
      updated,
    ]);

    return updated;
  } catch (error) {
    if (!isNetworkError(error)) {
      throw error;
    }

    return enqueueUpdate(id, data);
  }
}

export async function deleteTransactionWithOffline(
  id: string,
): Promise<void> {
  const queue = readQueue();

  const hasPendingOperation = queue.some(
    (item) =>
      (item.type === "create" && item.local_id === id) ||
      (item.type === "update" && item.transaction_id === id) ||
      (item.type === "delete" && item.transaction_id === id),
  );

  if (id.startsWith("local:") || hasPendingOperation) {
    enqueueDelete(id);

    if (navigator.onLine) {
      void syncPendingOperations();
    }

    return;
  }

  try {
    await apiDeleteTransaction(id);

    writeTransactionCache(
      readTransactionCache().filter((item) => item.id !== id),
    );
  } catch (error) {
    if (!isNetworkError(error)) {
      throw error;
    }

    enqueueDelete(id);
  }
}

// --------------------------------------------------
// 同期処理
// --------------------------------------------------

export async function syncPendingOperations(): Promise<SyncResult> {
  if (syncing) {
    return {
      online: true,
      synced: 0,
      pending: getPendingCount(),
      error: null,
    };
  }

  const initialQueue = readQueue();

  if (initialQueue.length === 0) {
    try {
      const transactions = await apiGetTransactions();
      writeTransactionCache(transactions);

      const categories = await apiGetCategories();
      writeCategoryCache(categories);

      return {
        online: true,
        synced: 0,
        pending: 0,
        error: null,
      };
    } catch (error) {
      return {
        online: false,
        synced: 0,
        pending: 0,
        error: error instanceof Error ? error.message : "接続できません。",
      };
    }
  }

  syncing = true;
  let synced = 0;

  try {
    // まずサーバーの最新状態を取得する
    let serverTransactions = await apiGetTransactions();

    for (const operation of initialQueue) {
      const currentQueue = readQueue();

      if (
        !currentQueue.some(
          (item) => item.operation_id === operation.operation_id,
        )
      ) {
        continue;
      }

      if (operation.type === "create") {
        // 完全一致する取引が存在すれば送信を省略
        const alreadyExists = serverTransactions.some((item) =>
          sameData(item, operation.data),
        );

        if (!alreadyExists) {
          const created = await apiCreateTransaction(operation.data);
          serverTransactions = [
            ...serverTransactions.filter((item) => item.id !== created.id),
            created,
          ];
        }
      }

      if (operation.type === "update") {
        const existing = serverTransactions.find(
          (item) => item.id === operation.transaction_id,
        );

        // 削除済みの場合は勝手に再作成しない。競合として残す
        if (!existing) {
          continue;
        }

        // サーバーがすでに更新後の内容なら送信を省略
        if (!sameData(existing, operation.data)) {
          const updated = await apiUpdateTransaction(
            operation.transaction_id,
            operation.data,
          );

          serverTransactions = serverTransactions.map((item) =>
            item.id === updated.id ? updated : item,
          );
        }
      }

      if (operation.type === "delete") {
        const existing = serverTransactions.find(
          (item) => item.id === operation.transaction_id,
        );

        // すでに存在しなければ削除済みと判断
        if (existing) {
          await apiDeleteTransaction(operation.transaction_id);

          serverTransactions = serverTransactions.filter(
            (item) => item.id !== operation.transaction_id,
          );
        }
      }

      // 処理成功した操作だけキューから取り除く
      writeQueue(
        readQueue().filter(
          (item) => item.operation_id !== operation.operation_id,
        ),
      );

      synced++;
    }

    // 最終的なサーバーデータを再取得
    const latestTransactions = await apiGetTransactions();
    const latestCategories = await apiGetCategories();

    writeTransactionCache(latestTransactions);
    writeCategoryCache(latestCategories);

    return {
      online: true,
      synced,
      pending: getPendingCount(),
      error: null,
    };
  } catch (error) {
    return {
      online: false,
      synced,
      pending: getPendingCount(),
      error: error instanceof Error ? error.message : "同期に失敗しました。",
    };
  } finally {
    syncing = false;
    notifySyncChanged();
  }
}
