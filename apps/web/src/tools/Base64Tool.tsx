import React, { useEffect, useRef, useState } from "react";
import { useUI } from "../preferences";
import { MAX_BYTES } from "./core.mjs";
import { Result, useProcessor } from "./useProcessor";
import { Output, useErrors } from "./Output";
import { useToolSafety } from "./Safety";
import { deriveToolSafety } from "./safety.mjs";
const encodings = ["utf-8", "utf-16le", "utf-16be", "latin1"];
export function Base64Tool() {
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
    [result, setResult] = useState<Result | null>(null),
    [error, setError] = useState(""),
    [resultName, setResultName] = useState("result.b64");
  const processor = useProcessor(),
    revision = useRef(0),
    mounted = useRef(true);
  useToolSafety(
    "base64",
    deriveToolSafety({
      hasDraft: text.length > 0,
      hasFiles: !!file,
      hasOutput: !!result,
      optionsChanged:
        encoding !== "utf-8" ||
        url ||
        !padding ||
        !strict ||
        wrap !== 0 ||
        dataURL,
      busy: processor.busy,
    }),
    () => {
      revision.current++;
      processor.cancel();
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
      });
      if (!mounted.current || current !== revision.current) return;
      setResult(output);
      setResultName(
        action === "encode"
          ? (file?.name || "text") + ".b64"
          : (file?.name.replace(/\.b64$/i, "") || "decoded") +
              (output.mime.startsWith("image/")
                ? "." + output.mime.split("/")[1]
                : ".bin"),
      );
    } catch (e) {
      if (mounted.current && current === revision.current) setError(message(e));
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
          "Large-file streaming, pause/resume, ZIP export and durable undo are not available. Inputs and outputs are limited to 8 MiB.",
          "尚未提供大型檔案串流、暫停／繼續、ZIP 匯出及持久復原。輸入及輸出均限於 8 MiB。",
        )}
      </p>
    </section>
  );
}
