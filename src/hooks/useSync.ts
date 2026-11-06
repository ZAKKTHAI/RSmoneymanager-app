import { useCallback, useEffect, useRef, useState } from "react";
import {
  getPendingCount,
  syncPendingOperations,
} from "../lib/sync";

export function useSync() {
  const [online, setOnline] = useState(false);
  const [pending, setPending] = useState(getPendingCount());
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const syncingRef = useRef(false);

  const syncNow = useCallback(async () => {
    if (syncingRef.current) return;

    syncingRef.current = true;
    setSyncing(true);

    try {
      const result = await syncPendingOperations();

      setOnline(result.online);
      setPending(result.pending);
      setError(result.error);
    } finally {
      setPending(getPendingCount());
      syncingRef.current = false;
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    void syncNow();

    const handleOnline = () => {
      void syncNow();
    };

    const handleSyncUpdated = () => {
      setPending(getPendingCount());
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("kakeibo-sync-updated", handleSyncUpdated);

    const interval = window.setInterval(() => {
      void syncNow();
    }, 15000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener(
        "kakeibo-sync-updated",
        handleSyncUpdated,
      );
      window.clearInterval(interval);
    };
  }, [syncNow]);

  return {
    online,
    pending,
    syncing,
    error,
    syncNow,
  };
}
