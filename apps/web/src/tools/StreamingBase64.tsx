import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useUI } from "../preferences";
import { useBase64Stream } from "./useBase64Stream";
import { ToolSafety } from "./ToolSafetyContext";
import { streamingSafety } from "../../../../packages/shared/local-base64/cleanup.mjs";
import { useToolCue } from "./useToolCue";
import { StreamOutput, StreamEntry as Entry } from "./StreamOutput";
export function StreamingBase64({
  options,
  onSafety,
  onDispose,
  onHistory,
  textSource = "",
}: {
  options: {
    url: boolean;
    padding: boolean;
    strict: boolean;
    wrap: number;
    dataURL?: boolean;
    mime?: string;
    encoding?: string;
  };
  textSource?: string;
  onSafety: (value: ToolSafety) => void;
  onDispose: (callback: (() => void) | null) => void;
  onHistory: (metadata: Record<string, unknown>) => Promise<void>;
}) {
  const cue = useToolCue();
  const { t, notice } = useUI(),
    stream = useBase64Stream();
  const [files, setFiles] = useState<FileList | null>(null),
    [consent, setConsent] = useState(false),
    [entries, setEntries] = useState<Entry[]>([]),
    [running, setRunning] = useState(false),
    [message, setMessage] = useState(""),
    [selection, setSelection] = useState(0);
  const generation = useRef(0),
    alive = useRef(true),
    callbacks = useRef({ onSafety, onDispose });
  callbacks.current = { onSafety, onDispose };
  const clear = () => {
    generation.current++;
    stream.dispose();
    setFiles(null);
    setEntries([]);
    setRunning(false);
    setMessage("");
    setSelection((value) => value + 1);
  };
  useLayoutEffect(() => {
    callbacks.current.onDispose(() => {
      generation.current++;
      stream.dispose();
    });
    return () => {
      callbacks.current.onDispose(null);
      callbacks.current.onSafety({
        known: false,
        dirty: false,
        pendingWrites: false,
      });
    };
  }, [stream.dispose]);
  useLayoutEffect(() => {
    callbacks.current.onSafety(
      streamingSafety({
        hasFiles: !!files?.length,
        hasOutputs: entries.length > 0,
        running,
        busy: stream.busy,
        cleanupPending: stream.cleanupPending,
        cleanupError: stream.cleanupError,
      }),
    );
  }, [
    files,
    entries.length,
    running,
    stream.busy,
    stream.cleanupError,
    stream.cleanupPending,
  ]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current++;
    };
  }, []);
  const describe = (error: unknown) => {
    const raw = error instanceof Error ? error.message : String(error);
    const [code, offset] = raw.split(":");
    const dictionary: Record<string, [string, string]> = {
      alphabet: [
        "A character is outside the selected Base64 alphabet.",
        "有字元不屬於所選 Base64 字母表。",
      ],
      padding: [
        "Padding or canonical trailing bits are invalid.",
        "補位或標準結尾位元無效。",
      ],
      encoding: [
        "The text cannot be represented in the selected encoding.",
        "文字無法以所選編碼表示。",
      ],
      "data-url": [
        "The data URL header or Base64 declaration is invalid.",
        "資料網址標頭或 Base64 宣告無效。",
      ],
      size: [
        "The input exceeds this workflow's supported size.",
        "輸入超過此流程支援的大小。",
      ],
      "storage-consent": [
        "Authorize temporary local storage first.",
        "請先授權暫時本機儲存。",
      ],
      "storage-unavailable": [
        "Private temporary storage is unavailable in this browser.",
        "此瀏覽器無法使用私密暫存。",
      ],
      "storage-quota": [
        "Insufficient verified storage quota. Free space or choose a smaller file.",
        "已驗證可用儲存空間不足，請騰出空間或選擇較小檔案。",
      ],
      "storage-write": [
        "Temporary output could not be written. No result was completed.",
        "未能寫入暫存輸出，沒有已完成結果。",
      ],
      "zip-limit": [
        "ZIP32 supports fewer than 65,536 entries and archives below 4 GiB; ZIP64 is unavailable.",
        "ZIP32 支援少於 65,536 個項目及小於 4 GiB 的封存檔，未提供 ZIP64。",
      ],
      cancelled: [
        "Cancelled; no partial result is offered.",
        "已取消，不提供不完整結果。",
      ],
      verification: [
        "Output verification failed. No result is offered.",
        "輸出驗證失敗，不提供結果。",
      ],
    };
    const item = dictionary[code] || [
      t(
        "Invalid input or local processing failed.",
        "輸入無效或本機處理失敗。",
      ),
      t(
        "Invalid input or local processing failed.",
        "輸入無效或本機處理失敗。",
      ),
    ];
    return (
      t(item[0], item[1]) +
      (offset !== undefined ? " " + t("Offset", "位置") + ": " + offset : "")
    );
  };
  const run = async (mode: "encode" | "decode") => {
    if (!files) return;
    const current = ++generation.current;
    let failures = 0;
    setRunning(true);
    setMessage("");
    for (let index = 0; index < files.length; index++) {
      if (!alive.current || current !== generation.current) break;
      const file = files[index];
      const entryId = crypto.randomUUID();
      setEntries((previous) => [
        ...previous,
        { id: entryId, name: file.name, status: "running" },
      ]);
      try {
        const output = await stream.run(file, mode, options, consent);
        if (!alive.current || current !== generation.current) {
          void stream.release(output.id);
          break;
        }
        setEntries((previous) =>
          previous.map((entry, i) =>
            entry.id === entryId
              ? { id: entryId, name: file.name, status: "verified", output }
              : entry,
          ),
        );
        void onHistory({
          name: file.name,
          mode: output.result.mode,
          inputSize: output.result.inputSize,
          outputSize: output.result.outputSize,
          inputSha256: output.result.inputSha256,
          outputSha256: output.result.outputSha256,
          options: output.result.options,
        }).catch(() => {});
      } catch (error) {
        failures++;
        if (!alive.current || current !== generation.current) break;
        setEntries((previous) =>
          previous.map((entry, i) =>
            entry.id === entryId
              ? {
                  id: entryId,
                  name: file.name,
                  status: "failed",
                  error: describe(error),
                }
              : entry,
          ),
        );
        if (error instanceof Error && error.message === "cancelled") break;
      }
    }
    if (alive.current && current === generation.current) {
      setRunning(false);
      cue(failures === 0);
      notice(
        t(
          "File processing finished. Review each result.",
          "檔案處理已結束，請查看各項結果。",
        ),
      );
    }
  };
  const exportZip = async () => {
    const current = ++generation.current;
    setRunning(true);
    setMessage("");
    try {
      const selected = entries
        .filter((entry) => entry.output && entry.output.result.mode !== "zip")
        .map((entry) => ({
          name:
            entry.name +
            (entry.output!.result.mode === "encode" ? ".b64" : ".decoded"),
          file: entry.output!.file,
        }));
      const output = await stream.run(
        new File([], "results.zip"),
        "zip",
        { files: selected },
        consent,
      );
      if (!alive.current || current !== generation.current) {
        void stream.release(output.id);
        return;
      }
      setEntries((previous) => [
        ...previous,
        {
          id: crypto.randomUUID(),
          name: "results.zip",
          status: "verified",
          output,
        },
      ]);
      void onHistory({
        name: "results.zip",
        mode: "zip",
        inputSize: output.result.inputSize,
        outputSize: output.result.outputSize,
        inputSha256: output.result.inputSha256,
        outputSha256: output.result.outputSha256,
        options: output.result.options,
      }).catch(() => {});
    } catch (error) {
      if (alive.current && current === generation.current)
        setMessage(describe(error));
    } finally {
      if (alive.current && current === generation.current) setRunning(false);
    }
  };
  const runText = async (mode: "encode" | "decode") => {
    const current = ++generation.current;
    setRunning(true);
    setMessage("");
    try {
      const output = await stream.run(
        new File([], "Text input"),
        mode,
        { ...options, textPayload: textSource },
        consent,
      );
      if (!alive.current || current !== generation.current) {
        void stream.release(output.id);
        return;
      }
      setEntries((previous) => [
        ...previous,
        {
          id: crypto.randomUUID(),
          name: "Text input",
          status: "verified",
          output,
        },
      ]);
      void onHistory({
        name: "Text input",
        mode,
        inputSize: output.result.inputSize,
        outputSize: output.result.outputSize,
        inputSha256: output.result.inputSha256,
        outputSha256: output.result.outputSha256,
        options: output.result.options,
      }).catch(() => {});
    } catch (error) {
      if (alive.current && current === generation.current)
        setMessage(describe(error));
    } finally {
      if (alive.current && current === generation.current) setRunning(false);
    }
  };
  return (
    <section
      className="tool-panel"
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!running) setFiles(event.dataTransfer.files);
      }}
    >
      <h3>{t("Stream large files locally", "在本機串流處理大型檔案")}</h3>
      <p>
        {t(
          "Text and files are processed in bounded chunks and verified by incremental SHA-256 and readback. Inputs remain unchanged. Data URLs use the standard alphabet and chosen MIME type; pasted or file-based data URLs are detected automatically.",
          "文字及檔案以有界分段處理，並以增量 SHA-256 及讀回驗證，輸入保持不變。資料網址使用標準字母表及所選 MIME 類型，貼上或檔案形式的資料網址會自動辨識。",
        )}
      </p>
      <label>
        <input
          type="checkbox"
          checked={consent}
          disabled={running}
          onChange={(e) => setConsent(e.target.checked)}
        />
        {t(
          "Allow temporary payload copies in this browser’s private storage. Clear results removes owned copies; a browser crash may leave copies until browser storage is cleared.",
          "容許在此瀏覽器的私密儲存保留暫時內容副本。清除結果會移除所屬副本；瀏覽器崩潰可能留下副本，直至清除瀏覽器儲存。",
        )}
      </label>
      <label>
        {t("Choose or drop files", "選擇或拖放檔案")}
        <input
          key={selection}
          type="file"
          multiple
          disabled={running}
          onChange={(e) => setFiles(e.target.files)}
        />
      </label>
      <p>
        {files?.length || 0} {t("files selected", "個已選檔案")}
      </p>
      <div className="tool-actions">
        <button
          disabled={!consent || running || stream.busy}
          onClick={() => void runText("encode")}
        >
          {t("Stream editor text", "串流編碼編輯器文字")}
        </button>
        <button
          disabled={!consent || running || stream.busy}
          onClick={() => void runText("decode")}
        >
          {t("Stream decode editor text", "串流解碼編輯器文字")}
        </button>
        <button
          disabled={!consent || !files?.length || running || stream.busy}
          onClick={() => void run("encode")}
        >
          {t("Stream encode", "串流編碼")}
        </button>
        <button
          disabled={!consent || !files?.length || running || stream.busy}
          onClick={() => void run("decode")}
        >
          {t("Stream decode", "串流解碼")}
        </button>
        {running && (
          <>
            <button onClick={stream.paused ? stream.resume : stream.pause}>
              {stream.paused ? t("Resume", "繼續") : t("Pause", "暫停")}
            </button>
            <button
              onClick={() => {
                generation.current++;
                stream.cancel();
                setRunning(false);
                setEntries((previous) =>
                  previous.map((entry) =>
                    entry.status === "running"
                      ? { ...entry, status: "cancelled" }
                      : entry,
                  ),
                );
                setMessage(t("Cancellation requested.", "已要求取消。"));
              }}
            >
              {t("Cancel", "取消")}
            </button>
          </>
        )}
        <button disabled={running} onClick={clear}>
          {t("Clear files and temporary outputs", "清除檔案選擇及暫存輸出")}
        </button>
        <button
          disabled={
            !consent ||
            running ||
            stream.busy ||
            !entries.some(
              (entry) => entry.output && entry.output.result.mode !== "zip",
            )
          }
          onClick={() => void exportZip()}
        >
          {t("Export verified results as ZIP", "將已驗證結果匯出為 ZIP")}
        </button>
      </div>
      {running && (
        <>
          <progress
            max={Math.max(1, stream.progress.total)}
            value={stream.progress.inputSize}
            aria-label={t("Source bytes processed", "已處理來源位元組")}
          />
          <p role="status">
            {stream.paused
              ? t("Paused", "已暫停")
              : stream.progress.phase === "verify"
                ? t("Verifying output", "正在驗證輸出")
                : t("Transforming", "正在轉換")}{" "}
            · {stream.progress.inputSize.toLocaleString()} /{" "}
            {stream.progress.total.toLocaleString()}
          </p>
        </>
      )}
      {stream.cleanupPending > 0 && (
        <p role="status">
          {t(
            "Removing owned temporary outputs. Safety remains pending until removal is verified.",
            "正在移除所屬暫存輸出，驗證移除前安全狀態仍待確認。",
          )}
        </p>
      )}
      {(message || stream.cleanupError) && (
        <p role="alert">
          {stream.cleanupError
            ? t(
                "Temporary cleanup could not be verified. The tool remains unsafe to close without review.",
                "未能驗證暫存清理，工具仍未能安全關閉，請先檢查。",
              )
            : message}
        </p>
      )}
      <ol className="tool-results">
        {entries.map((entry, index) => (
          <li key={index}>
            <h4>{entry.name}</h4>
            <p>
              {entry.status === "verified"
                ? t("Verified", "已驗證")
                : entry.status === "running"
                  ? t("Processing", "處理中")
                  : t("Failed or cancelled", "失敗或已取消")}
            </p>
            {entry.error && <p>{entry.error}</p>}
            {entry.output && <StreamOutput entry={entry} />}
          </li>
        ))}
      </ol>
    </section>
  );
}
