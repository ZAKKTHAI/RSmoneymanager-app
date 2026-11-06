import type { TransactionInput } from "./api";

interface PendingBase {
  operation_id: string;
  created_at: string;
}

export interface PendingCreate extends PendingBase {
  type: "create";
  local_id: string;
  data: TransactionInput;
}

export interface PendingUpdate extends PendingBase {
  type: "update";
  transaction_id: string;
  data: TransactionInput;
}

export interface PendingDelete extends PendingBase {
  type: "delete";
  transaction_id: string;
}

export type PendingOperation =
  | PendingCreate
  | PendingUpdate
  | PendingDelete;

export interface SyncResult {
  online: boolean;
  synced: number;
  pending: number;
  error: string | null;
}
