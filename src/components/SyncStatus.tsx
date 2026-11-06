interface SyncStatusProps {
  online: boolean;
  pending: number;
  syncing: boolean;
  error: string | null;
  onSync: () => void;
}

export default function SyncStatus({
  online,
  pending,
  syncing,
  error,
  onSync,
}: SyncStatusProps) {
  return (
    <div className="sync-status">
      <div className="sync-status-main">
        <span
          className={`status-dot ${
            online ? "online" : "offline"
          }`}
        />

        <span className="sync-status-label">
          {syncing
            ? "同期中"
            : online
              ? "サーバー接続中"
              : "オフライン"}
        </span>

        {pending > 0 && (
          <span className="sync-pending-count">
            未同期 {pending}件
          </span>
        )}
      </div>

      {(pending > 0 || !online || error) && (
        <button
          type="button"
          className="sync-retry-button"
          onClick={onSync}
          disabled={syncing}
        >
          {syncing ? "同期中..." : "同期する"}
        </button>
      )}

      {error && (
        <span className="sync-error-message" title={error}>
          {error}
        </span>
      )}
    </div>
  );
}
