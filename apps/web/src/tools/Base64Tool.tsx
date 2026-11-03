import React, { useEffect, useRef, useState } from "react";
import { useUI } from "../preferences";
import { MAX_BYTES } from "./core.mjs";
import { Result, useProcessor } from "./useProcessor";
import { Output, useErrors } from "./Output";
import { useToolSafety } from "./ToolSafetyContext";
import { deriveToolSafety } from "./safety.mjs";
import { StreamingBase64 } from "./StreamingBase64";
import { ToolSafety } from "./ToolSafetyContext";
import { Base64History, HistoryWriter } from "./Base64History";
import { useToolCue } from "./useToolCue";
const encodings = ["utf-8", "utf-16le", "utf-16be", "latin1"];
export function Base64Tool() {
  const cue = useToolCue();
  const [streamSafety, setStreamSafety] = useState<ToolSafety>({
    known: false,
    dirty: false,
    pendingWrites: false,
  });
  const disposeStream = useRef<(() => void) | null>(null);
  const historyWriter = useRef<HistoryWriter | null>(null),
    [historyBusy, setHistoryBusy] = useState(false);
  const { t } = useUI(),
    message = useErrors();
  const [text, setText] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [encoding, setEncoding] = useState("utf-8"),
    [url, setUrl] = useState(false),
    [padding, setPadding] = useState(true),
    [strict, setStrict] = useState(true),
    [wrap, setWrap] = useState(0),
    [dataURL, setDataURL] = useState(false),
    [mime, setMime] = useState("application/octet-stream"),
    [clipboardBusy, setClipboardBusy] = useState(false),
    [result, setResult] = useState<Result | null>(null),
    [error, setError] = useState(""),
    [resultName, setResultName] = useState("result.b64");
  const processor = useProcessor(),
    revision = useRef(0),
    mounted = useRef(true);
  useToolSafety(
    "base64",
    {
      ...deriveToolSafety({
        hasDraft: text.length > 0,
        hasFiles: !!file,
        hasOutput: !!result || streamSafety.dirty,
        optionsChanged:
          encoding !== "utf-8" ||
          url ||
          !padding ||
          !strict ||
          wrap !== 0 ||
          dataURL ||
          mime !== "application/octet-stream",
        busy:
          processor.busy ||
          streamSafety.pendingWrites ||
          historyBusy ||
          clipboardBusy,
      }),
      known: streamSafety.known,
    },
    () => {
      revision.current++;
      processor.cancel();
      disposeStream.current?.();
    },
  );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      revision.current++;
    };
  }, []);
  const invalidate = () => {
    revision.current++;
    processor.cancel();
    setResult(null);
    setError("");
  };
  const run = async (action: "encode" | "decode") => {
    const current = ++revision.current;
    setError("");
    setResult(null);
    try {
      if (file && file.size > MAX_BYTES) throw Error("size");
      const output = await processor.run({
        action,
        text,
        file,
        encoding,
        options: { url, padding, strict, wrap },
        dataURL,
        mime,
      });
      if (!mounted.current || current !== revision.current) return;
      setResult(output);
      cue(true);
      if (output.inputSha256)
        void historyWriter
          .current?.({
            name: file?.name || "Text input",
            mode: action,
            inputSize: output.inputSize,
            outputSize: output.outputSize,
            inputSha256: output.inputSha256,
            outputSha256: output.sha256,
            options: { url, padding, strict, wrap, encoding, dataURL, mime },
          })
          .catch(() => {});
      setResultName(
        action === "encode"
          ? (file?.name || "text") + ".b64"
          : (file?.name.replace(/\.b64$/i, "") || "decoded") +
              (output.mime.startsWith("image/")
                ? "." + output.mime.split("/")[1]
                : ".bin"),
      );
    } catch (e) {
      if (mounted.current && current === revision.current) cue(false);
      if (mounted.current && current === revision.current) setError(message(e));
    }
  };
  const importClipboard = async () => {
    const current = ++revision.current;
    setClipboardBusy(true);
    try {
      const value = await navigator.clipboard.readText();
      if (!mounted.current || current !== revision.current) return;
      if (value.length > MAX_BYTES) throw Error("size");
      invalidate();
      setFile(null);
      setText(value);
    } catch (error) {
      if (mounted.current && current === revision.current)
        setError(
          message(
            error instanceof Error && error.message === "size"
              ? error
              : Error("clipboard"),
          ),
        );
    } finally {
      if (mounted.current) setClipboardBusy(false);
    }
  };
  return (
    <section className="tool-panel">
      <h2>{t("Base64 toolkit", "Base64 工具")}</h2>
      <p>
        {t(
          "Transform bytes locally. Encoding is not encryption. Nothing is uploaded or saved to history.",
          "在本機轉換位元組。編碼並非加密，內容不會上傳或存入紀錄。",
        )}
      </p>
      <label>
        {t("Text or Base64 source", "文字或 Base64 來源")}
        <textarea
          rows={7}
          maxLength={MAX_BYTES}
          value={text}
          onChange={(e) => {
            invalidate();
            setFile(null);
            setText(e.target.value);
          }}
          disabled={!!file}
        />
      </label>
      <button
        type="button"
        disabled={clipboardBusy}
        onClick={() => void importClipboard()}
      >
        {t("Import clipboard text", "匯入剪貼簿文字")}
      </button>
      <label>
        {t("Or choose a file (up to 8 MiB)", "或選擇檔案（最多 8 MiB）")}
        <input
          type="file"
          onChange={(e) => {
            invalidate();
            const selected = e.target.files?.[0] || null;
            if (selected && selected.size > MAX_BYTES) {
              setError(message(Error("size")));
              setFile(null);
              e.target.value = "";
            } else setFile(selected);
          }}
        />
      </label>
      {file && (
        <button
          type="button"
          onClick={() => {
            invalidate();
            setFile(null);
          }}
        >
          {t("Use text instead", "改用文字")}
        </button>
      )}
      <div className="tool-options">
        <label>
          {t("Character encoding", "字元編碼")}
          <select
            value={encoding}
            onChange={(e) => {
              invalidate();
              setEncoding(e.target.value);
            }}
          >
            {encodings.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          {t("Line length (0 = no wrapping)", "每行長度（0 代表不換行）")}
          <input
            type="number"
            min={0}
            max={4096}
            value={wrap}
            onChange={(e) => {
              invalidate();
              setWrap(Number(e.target.value));
            }}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={url}
            onChange={(e) => {
              invalidate();
              setUrl(e.target.checked);
            }}
          />{" "}
          {t("URL-safe alphabet", "網址安全字母表")}
        </label>
        <label>
          <input
            type="checkbox"
            checked={padding}
            onChange={(e) => {
              invalidate();
              setPadding(e.target.checked);
            }}
          />{" "}
          {t("Include padding", "加入補位")}
        </label>
        <label>
          <input
            type="checkbox"
            checked={strict}
            onChange={(e) => {
              invalidate();
              setStrict(e.target.checked);
            }}
          />{" "}
          {t(
            "Strict decode (requires padding, no whitespace)",
            "嚴格解碼（需要補位，不容空白）",
          )}
        </label>
        <label>
          <input
            type="checkbox"
            checked={dataURL}
            onChange={(e) => {
              invalidate();
              setDataURL(e.target.checked);
            }}
          />{" "}
          {t(
            "Encode as data URL (standard alphabet)",
            "編碼為資料網址（標準字母表）",
          )}
        </label>
      </div>
      <div className="tool-actions">
        {dataURL && (
          <label>
            {t("Data URL MIME type", "資料網址 MIME 類型")}
            <input
              value={mime}
              maxLength={255}
              onChange={(event) => {
                invalidate();
                setMime(event.target.value);
              }}
            />
          </label>
        )}
        <button disabled={processor.busy} onClick={() => void run("encode")}>
          {t("Encode", "編碼")}
        </button>
        <button disabled={processor.busy} onClick={() => void run("decode")}>
          {t("Decode", "解碼")}
        </button>
        {processor.busy && (
          <button
            onClick={() => {
              revision.current++;
              processor.cancel();
              setError(message(Error("cancelled")));
            }}
          >
            {t("Cancel", "取消")}
          </button>
        )}
      </div>
      {processor.busy && (
        <progress
          aria-label={t("Processing", "處理中")}
          value={processor.progress}
          max={100}
        />
      )}
      <p role="status">
        {error || (result ? t("Result verified.", "結果已驗證。") : "")}
      </p>
      {result && <Output result={result} name={resultName} />}
      <p className="tool-muted">
        {t(
          "The text editor is limited to 8 MiB. Use the streaming file workspace below for larger inputs. History stores metadata only.",
          "文字編輯器限於 8 MiB，大型輸入請使用下方串流檔案工作區。紀錄只儲存中繼資料。",
        )}
      </p>
      <StreamingBase64
        options={{ url, padding, strict, wrap, dataURL, mime, encoding }}
        textSource={text}
        onHistory={(metadata) =>
          historyWriter.current?.(metadata) || Promise.resolve()
        }
        onSafety={setStreamSafety}
        onDispose={(callback) => {
          disposeStream.current = callback;
        }}
      />
      <Base64History
        onReady={(writer) => {
          historyWriter.current = writer;
        }}
        onBusy={setHistoryBusy}
      />
    </section>
  );
}
