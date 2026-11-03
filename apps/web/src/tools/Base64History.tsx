import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { openHistory } from "../../../../packages/shared/local-base64/history.mjs";
import { useUI } from "../preferences";
export type HistoryWriter = (
  metadata: Record<string, unknown>,
) => Promise<void>;
export function Base64History({
  onReady,
  onBusy,
}: {
  onReady: (writer: HistoryWriter | null) => void;
  onBusy: (value: boolean) => void;
}) {
  const { t } = useUI(),
    database = useRef<any>(null),
    alive = useRef(true),
    lifecycle = useRef(0),
    callbacks = useRef({ onReady, onBusy });
  callbacks.current = { onReady, onBusy };
  const [page, setPage] = useState<any>({
      entries: [],
      next: null,
      canUndo: false,
      canRedo: false,
    }),
    [pending, setPending] = useState(0),
    [error, setError] = useState(false),
    [confirm, setConfirm] = useState(false),
    [word, setWord] = useState(""),
    [understood, setUnderstood] = useState(false);
  const busy = pending > 0;
  const refresh = async () => {
    if (database.current) {
      const result = await database.current.page();
      if (alive.current) setPage(result);
    }
  };
  const act = useCallback(
    async (action: (db: any) => Promise<unknown>, refreshAfter = true) => {
      if (!database.current) throw Error("history-storage");
      const current = lifecycle.current;
      setPending((count) => count + 1);
      setError(false);
      try {
        await action(database.current);
        if (refreshAfter && current === lifecycle.current) await refresh();
      } catch {
        if (alive.current) setError(true);
        throw Error("history-storage");
      } finally {
        if (alive.current && current === lifecycle.current)
          setPending((count) => Math.max(0, count - 1));
      }
    },
    [],
  );
  useLayoutEffect(() => {
    callbacks.current.onBusy(busy);
  }, [busy]);
  useEffect(() => {
    alive.current = true;
    lifecycle.current++;
    let disposed = false;
    let db: any;
    void openHistory()
      .then((value) => {
        db = value;
        if (!alive.current || disposed) {
          db.close();
          return;
        }
        database.current = db;
        callbacks.current.onReady((metadata) =>
          act((current) => current.append(metadata)),
        );
        void refresh();
      })
      .catch(() => {
        if (alive.current) setError(true);
      });
    return () => {
      alive.current = false;
      disposed = true;
      lifecycle.current++;
      database.current = null;
      db?.close();
      callbacks.current.onReady(null);
      callbacks.current.onBusy(false);
    };
  }, [act]);
  const invoke = (action: (db: any) => Promise<unknown>) =>
    void act(action).catch(() => {});
  return (
    <section className="tool-panel">
      <h3>{t("Local conversion history", "本機轉換紀錄")}</h3>
      <p>
        {t(
          "Only names, sizes, hashes, options and timestamps are stored. Undo/redo select metadata snapshots, not payload copies; reselect an original file to run it again. History length is limited only by browser storage, with paged reading.",
          "只儲存名稱、大小、雜湊、選項及時間。復原／重做選取中繼資料快照，不會保留內容副本；再次執行時請重新選擇原檔案。紀錄長度只受瀏覽器儲存限制，並分頁閱讀。",
        )}
      </p>
      <div className="tool-actions">
        <button
          disabled={busy || !page.canUndo}
          onClick={() => invoke((db) => db.undo())}
        >
          {t("Undo history selection", "復原紀錄選擇")}
        </button>
        <button
          disabled={busy || !page.canRedo}
          onClick={() => invoke((db) => db.redo())}
        >
          {t("Redo history selection", "重做紀錄選擇")}
        </button>
        <button disabled={busy} onClick={() => setConfirm(true)}>
          {t("Clear history…", "清除紀錄…")}
        </button>
      </div>
      {confirm && (
        <section
          aria-label={t(
            "Confirm permanent history removal",
            "確認永久移除紀錄",
          )}
        >
          <label>
            {t(
              "Type CLEAR to remove all metadata history",
              "輸入 CLEAR 以移除所有中繼資料紀錄",
            )}
            <input value={word} onChange={(e) => setWord(e.target.value)} />
          </label>
          <label>
            <input
              type="checkbox"
              checked={understood}
              onChange={(e) => setUnderstood(e.target.checked)}
            />
            {t(
              "This cannot be undone. Original files are not affected.",
              "此動作無法復原，原檔案不受影響。",
            )}
          </label>
          <button
            disabled={busy || word !== "CLEAR" || !understood}
            onClick={() =>
              invoke(async (db) => {
                await db.clear(true);
                setConfirm(false);
                setWord("");
                setUnderstood(false);
              })
            }
          >
            {t("Permanently clear metadata", "永久清除中繼資料")}
          </button>
          <button onClick={() => setConfirm(false)}>
            {t("Keep history", "保留紀錄")}
          </button>
        </section>
      )}
      {error && (
        <p role="alert">
          {t(
            "History storage is unavailable or could not be updated. The conversion result remains separate.",
            "紀錄儲存不可用或未能更新，轉換結果保持獨立。",
          )}
        </p>
      )}
      <ol className="tool-results">
        {page.entries.map((entry: any) => (
          <li key={entry.id}>
            <strong>{entry.metadata.name}</strong>
            <p>
              {entry.metadata.mode} ·{" "}
              {entry.metadata.inputSize.toLocaleString()} →{" "}
              {entry.metadata.outputSize.toLocaleString()} · {entry.metadata.at}
            </p>
            <code>{entry.metadata.outputSha256}</code>
          </li>
        ))}
      </ol>
      {page.next && (
        <button
          disabled={busy}
          onClick={() =>
            void act(
              async (db) => setPage(await db.page(page.next)),
              false,
            ).catch(() => {})
          }
        >
          {t("Older entries", "較舊紀錄")}
        </button>
      )}
    </section>
  );
}
