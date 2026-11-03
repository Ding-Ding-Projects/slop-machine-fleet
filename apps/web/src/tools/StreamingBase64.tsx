import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useUI } from "../preferences";
import { useBase64Stream, StreamResult } from "./useBase64Stream";
import { ToolSafety } from "./ToolSafetyContext";
import { sniff, decodeText, imageDimensions } from "./core.mjs";
import {
  detectedMedia,
  previewLabel,
} from "../../../../packages/shared/local-base64/preview.mjs";
import { useToolCue } from "./useToolCue";
type Entry = {
  id: string;
  name: string;
  status: string;
  output?: StreamResult;
  error?: string;
};
function saveFile(file: Blob, name: string) {
  const url = URL.createObjectURL(file),
    link = document.createElement("a");
  link.href = url;
  link.download =
    name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 180) || "result";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function StreamOutput({ entry }: { entry: Entry }) {
  const { t } = useUI(),
    [preview, setPreview] = useState(""),
    [media, setMedia] = useState<{ url: string; mime: string } | null>(null);
  const output = entry.output!;
  const extension =
    (
      {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/webp": ".webp",
        "audio/wav": ".wav",
        "audio/mpeg": ".mp3",
        "audio/ogg": ".ogg",
        "audio/flac": ".flac",
        "video/mp4": ".mp4",
        "video/webm": ".webm",
      } as Record<string, string>
    )[output.result.mime || ""] || ".bin";
  const previewGeneration = useRef(0),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      previewGeneration.current++;
    };
  }, []);
  useEffect(
    () => () => {
      if (media) URL.revokeObjectURL(media.url);
    },
    [media],
  );
  const inspect = async () => {
    const current = ++previewGeneration.current;
    const raw = await output.file
      .slice(0, 65536)
      .arrayBuffer()
      .catch(() => null);
    if (!mounted.current || current !== previewGeneration.current) return;
    if (!raw) {
      setPreview(
        t("Temporary output is no longer available.", "暫存輸出已無法使用。"),
      );
      return;
    }
    const bytes = new Uint8Array(raw),
      mime = detectedMedia(bytes);
    if (!mounted.current || current !== previewGeneration.current) return;
    if (mime && output.file.size > 32 * 1024 * 1024) {
      setPreview(
        t(
          "Media preview exceeds the 32 MiB bound. Download preserves the complete file.",
          "媒體預覽超過 32 MiB 上限，下載保留完整檔案。",
        ),
      );
      return;
    }
    if (mime?.startsWith("image/")) {
      try {
        if (mime === "image/png") {
          const view = new DataView(
              bytes.buffer,
              bytes.byteOffset,
              bytes.byteLength,
            ),
            width = view.getUint32(16),
            height = view.getUint32(20);
          if (
            !width ||
            !height ||
            width > 8192 ||
            height > 8192 ||
            width * height > 16000000
          )
            throw Error("dimensions");
          if (new TextDecoder("latin1").decode(bytes).includes("acTL"))
            throw Error("animation");
        } else imageDimensions(bytes, mime);
        setMedia({
          url: URL.createObjectURL(new Blob([output.file], { type: mime })),
          mime,
        });
        return;
      } catch {
        setPreview(
          t(
            "Image preview is unavailable or exceeds safe dimensions.",
            "圖片預覽不可用或超過安全尺寸。",
          ),
        );
        return;
      }
    }
    if (mime?.startsWith("audio/") || mime?.startsWith("video/")) {
      const element = document.createElement(
        mime.startsWith("audio/") ? "audio" : "video",
      );
      if (!element.canPlayType(mime)) {
        setPreview(
          t(
            "This browser has no supported preview codec for this format.",
            "此瀏覽器沒有支援此格式的預覽編碼器。",
          ),
        );
        return;
      }
      setMedia({
        url: URL.createObjectURL(new Blob([output.file], { type: mime })),
        mime,
      });
      return;
    }
    try {
      setPreview(
        decodeText(
          bytes,
          output.result.mode === "encode"
            ? "utf-8"
            : String(output.result.options.encoding || "utf-8"),
        ) +
          (output.file.size > 65536
            ? "\n" +
              t(
                "Preview truncated; download keeps all bytes.",
                "預覽已縮短，下載保留所有位元組。",
              )
            : ""),
      );
    } catch {
      setPreview(
        Array.from(bytes.subarray(0, 256), (x) =>
          x.toString(16).padStart(2, "0"),
        ).join(" "),
      );
    }
  };
  return (
    <section>
      {output.result.inputSize === 0 && (
        <p>
          {t(
            "Empty input produced an empty payload.",
            "空白輸入產生空白內容。",
          )}
        </p>
      )}
      <p>
        {output.result.inputSize.toLocaleString()} →{" "}
        {output.result.outputSize.toLocaleString()}{" "}
        {t("bytes, verified", "位元組，已驗證")}
      </p>
      <p className="tool-hash">SHA-256: {output.result.outputSha256}</p>
      {output.result.dataURL && (
        <p>
          {t("Parsed data URL", "已解析資料網址")}: {output.result.dataURL.mime}{" "}
          {output.result.dataURL.parameters.join("; ")}
        </p>
      )}
      <div className="tool-actions">
        <button
          onClick={() =>
            saveFile(
              output.file,
              entry.name +
                (output.result.mode === "encode"
                  ? ".b64"
                  : output.result.mode === "zip"
                    ? ""
                    : extension),
            )
          }
        >
          {t("Download verified result", "下載已驗證結果")}
        </button>
        <button onClick={() => void inspect()}>
          {t("Preview safely", "安全預覽")}
        </button>
        {output.result.mode !== "zip" &&
          output.file.size <= 8 * 1024 * 1024 && (
            <button
              onClick={async () => {
                const current = ++previewGeneration.current;
                try {
                  const data = new Uint8Array(await output.file.arrayBuffer());
                  if (!mounted.current || current !== previewGeneration.current)
                    return;
                  await navigator.clipboard.writeText(
                    decodeText(
                      data,
                      output.result.mode === "encode"
                        ? "utf-8"
                        : String(output.result.options.encoding || "utf-8"),
                    ),
                  );
                  if (mounted.current && current === previewGeneration.current)
                    setPreview(
                      t(
                        "Complete text copied explicitly.",
                        "已明確複製完整文字。",
                      ),
                    );
                } catch {
                  if (mounted.current && current === previewGeneration.current)
                    setPreview(
                      t(
                        "Text cannot be copied in the selected encoding, or clipboard access is unavailable.",
                        "所選編碼無法複製此文字，或剪貼簿存取不可用。",
                      ),
                    );
                }
              }}
            >
              {t(
                "Copy complete text (up to 8 MiB)",
                "複製完整文字（最多 8 MiB）",
              )}
            </button>
          )}
        <button
          onClick={() =>
            saveFile(
              new Blob(
                [
                  JSON.stringify(
                    { name: entry.name, ...output.result },
                    null,
                    2,
                  ),
                ],
                { type: "application/json" },
              ),
              entry.name + ".conversion.json",
            )
          }
        >
          {t("Export metadata only", "只匯出中繼資料")}
        </button>
      </div>
      {preview && <pre>{preview}</pre>}
      {media && (
        <iframe
          title={t("Sandboxed media preview", "沙盒媒體預覽")}
          sandbox=""
          referrerPolicy="no-referrer"
          srcDoc={`<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src blob:; media-src blob:; style-src 'unsafe-inline'"><style>body{margin:0}img,video,audio{max-width:100%;max-height:300px}</style>${previewLabel(media.mime) === "image" ? `<img alt="Preview" src="${media.url}">` : `<${previewLabel(media.mime)} controls preload="none" src="${media.url}"></${previewLabel(media.mime)}>`}`}
        />
      )}
    </section>
  );
}
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
    callbacks.current.onSafety({
      known: !stream.cleanupError,
      dirty: !!files?.length || entries.length > 0,
      pendingWrites: running || stream.busy,
    });
  }, [files, entries.length, running, stream.busy, stream.cleanupError]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current++;
    };
  }, []);
  const describe = (error: unknown) => {
    const code = error instanceof Error ? error.message : String(error);
    const dictionary: Record<string, [string, string]> = {
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
      (code.includes(":")
        ? " " + t("Offset", "位置") + ": " + code.split(":")[1]
        : "")
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
