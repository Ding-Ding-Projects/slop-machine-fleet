import React, { useEffect, useRef, useState } from "react";
import { useUI } from "../preferences";
import { MAX_BYTES } from "./core.mjs";
import { Result, useProcessor } from "./useProcessor";
import { Output, useErrors } from "./Output";
import { useToolSafety } from "./Safety";
import { deriveToolSafety } from "./safety.mjs";
type Item = {
  file: File;
  state: "queued" | "running" | "done" | "failed" | "cancelled";
  result?: Result;
  error?: string;
};
export function Converter() {
  const { t } = useUI(),
    message = useErrors();
  const [items, setItems] = useState<Item[]>([]),
    [source, setSource] = useState("csv"),
    [target, setTarget] = useState("json"),
    [kind, setKind] = useState<"data" | "image">("data"),
    [capabilities, setCapabilities] = useState<Record<string, boolean>>({}),
    [running, setRunning] = useState(false),
    [status, setStatus] = useState("");
  const processor = useProcessor(),
    revision = useRef(0),
    mounted = useRef(true);
  useToolSafety(
    "converter",
    deriveToolSafety({
      hasFiles: items.length > 0,
      hasOutput: items.some((item) => !!item.result),
      optionsChanged: source !== "csv" || target !== "json" || kind !== "data",
      busy: running || processor.busy,
    }),
    () => {
      revision.current++;
      processor.cancel();
    },
  );
  useEffect(() => {
    mounted.current = true;
    let worker: Worker | null = null;
    try {
      worker = new Worker(new URL("./worker.js", import.meta.url), {
        type: "module",
      });
      worker.onmessage = ({ data }) => {
        if (data.capabilities) setCapabilities(data.capabilities);
        worker?.terminate();
      };
      worker.postMessage({ action: "capabilities" });
    } catch {
      /* Missing worker capability remains disabled. */
    }
    return () => {
      mounted.current = false;
      revision.current++;
      worker?.terminate();
    };
  }, []);
  const change = () => {
    revision.current++;
    processor.cancel();
    setRunning(false);
    setItems([]);
    setStatus("");
  };
  const cancel = () => {
    revision.current++;
    processor.cancel();
    setRunning(false);
    setItems((current) =>
      current.map((item) =>
        item.state === "queued" || item.state === "running"
          ? { ...item, state: "cancelled" }
          : item,
      ),
    );
    setStatus(message(Error("cancelled")));
  };
  const run = async () => {
    const current = ++revision.current;
    setRunning(true);
    setStatus("");
    for (let i = 0, totalOutput = 0; i < items.length; i++) {
      if (!mounted.current || current !== revision.current) break;
      const file = items[i].file;
      setItems((old) =>
        old.map((item, j) =>
          j === i ? { file: item.file, state: "running" } : item,
        ),
      );
      try {
        if (file.size > MAX_BYTES) throw Error("size");
        const result = await processor.run({
          action: "convert",
          file,
          source,
          target,
        });
        if (!mounted.current || current !== revision.current) break;
        totalOutput += result.outputSize;
        if (totalOutput > 32 * 1024 * 1024) throw Error("size");
        setItems((old) =>
          old.map((item, j) =>
            j === i ? { file: item.file, state: "done", result } : item,
          ),
        );
      } catch (error) {
        if (!mounted.current || current !== revision.current) break;
        setItems((old) =>
          old.map((item, j) =>
            j === i
              ? { file: item.file, state: "failed", error: message(error) }
              : item,
          ),
        );
      }
    }
    if (mounted.current && current === revision.current) {
      setRunning(false);
      setStatus(
        t(
          "Batch finished. Review each outcome below.",
          "批次已完成，請查看下方每項結果。",
        ),
      );
    }
  };
  const states = {
    queued: t("Queued", "等待中"),
    running: t("Processing", "處理中"),
    done: t("Converted", "已轉換"),
    failed: t("Failed", "失敗"),
    cancelled: t("Cancelled", "已取消"),
  };
  return (
    <section className="tool-panel">
      <h2>{t("Local file converter", "本機檔案轉換器")}</h2>
      <p>
        {t(
          "Select a supported workflow, review what changes, then convert. Originals are never overwritten.",
          "選擇支援的工作流程，查看變更說明後再轉換，原檔案永不覆寫。",
        )}
      </p>
      <div className="tool-options">
        <label>
          {t("Category", "類別")}
          <select
            value={kind}
            disabled={running}
            onChange={(e) => {
              change();
              const k = e.target.value as "data" | "image";
              setKind(k);
              setTarget(k === "image" ? "image/png" : "json");
            }}
          >
            <option value="data">{t("Structured data", "結構化資料")}</option>
            <option value="image">{t("Images", "圖片")}</option>
          </select>
        </label>
        {kind === "data" && (
          <label>
            {t(
              "Source format (validated from content)",
              "來源格式（驗證內容）",
            )}
            <select
              value={source}
              disabled={running}
              onChange={(e) => {
                change();
                setSource(e.target.value);
              }}
            >
              {["json", "csv", "tsv"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
        )}
        <label>
          {t("Target format", "目標格式")}
          <select
            value={target}
            disabled={running}
            onChange={(e) => {
              change();
              setTarget(e.target.value);
            }}
          >
            {(kind === "image"
              ? ["image/png", "image/jpeg", "image/webp"]
              : ["json", "csv", "tsv"]
            ).map((x) => (
              <option
                key={x}
                value={x}
                disabled={kind === "image" && !capabilities[x]}
              >
                {x}
                {kind === "image" && !capabilities[x]
                  ? " (" + t("codec unavailable", "編碼器不可用") + ")"
                  : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      <aside className="tool-warning">
        {kind === "image"
          ? t(
              "PNG, JPEG and static WebP only. Metadata and color profiles may be removed. Animation is unsupported. JPEG is lossy and flattens transparency onto white. WebP uses quality 90%. Maximum 8192 pixels per side and 16 megapixels.",
              "只支援 PNG、JPEG 及靜態 WebP。可能移除中繼資料及色彩描述檔，不支援動畫。JPEG 有損並將透明背景轉為白色，WebP 品質為 90%。每邊最多 8192 像素，總共 1600 萬像素。",
            )
          : t(
              "JSON must be a rectangular array of scalar-value arrays. CSV/TSV cells become strings; JSON null becomes the text “null”. Numbers and booleans lose their JSON types in table output. No header inference or nested-object flattening. Output is UTF-8 with CRLF table rows. Spreadsheet formula-like cells are preserved as data; importing them into spreadsheet software may execute formulas.",
              "JSON 必須是每行欄數相同的純值陣列。CSV／TSV 儲存格轉為字串，JSON null 轉為文字「null」。表格輸出的數字及布林值不保留 JSON 類型。不推斷標題或展開巢狀物件。輸出為 UTF-8，表格使用 CRLF 換行。類似公式的儲存格會原樣保留，匯入試算表軟件時可能執行公式。",
            )}
      </aside>
      <label>
        {t(
          "Choose files (8 MiB each, up to 100 per batch)",
          "選擇檔案（每個 8 MiB，每批最多 100 個）",
        )}
        <input
          type="file"
          multiple
          disabled={running}
          accept={
            kind === "image" ? ".png,.jpg,.jpeg,.webp" : ".json,.csv,.tsv"
          }
          onChange={(e) => {
            revision.current++;
            processor.cancel();
            const files = e.target.files;
            if (!files) return;
            if (
              files.length > 100 ||
              Array.from(files).reduce((sum, file) => sum + file.size, 0) >
                32 * 1024 * 1024
            ) {
              setStatus(
                t(
                  "Choose at most 100 files totaling 32 MiB. Persistent unlimited queues are not available.",
                  "請選擇最多 100 個檔案，總共不超過 32 MiB，目前未提供持久無限佇列。",
                ),
              );
              setItems([]);
              return;
            }
            setItems(
              Array.from(files, (file) => ({
                file,
                state: file.size > MAX_BYTES ? "failed" : "queued",
                error:
                  file.size > MAX_BYTES ? message(Error("size")) : undefined,
              })),
            );
            setStatus("");
          }}
        />
      </label>
      <div className="tool-actions">
        <button
          disabled={
            running ||
            !items.length ||
            (kind === "image" && !capabilities[target])
          }
          onClick={() => void run()}
        >
          {t("Convert selected files", "轉換所選檔案")}
        </button>
        {running && (
          <button onClick={cancel}>
            {t("Cancel remaining work", "取消餘下工作")}
          </button>
        )}
        <button disabled={running || !items.length} onClick={change}>
          {t("Clear results", "清除結果")}
        </button>
      </div>
      <p role="status">
        {status ||
          (running
            ? t(
                "Processing locally, one file at a time.",
                "正於本機逐一處理檔案。",
              )
            : t("Select files to begin.", "請選擇檔案開始。"))}
      </p>
      {running && (
        <progress
          aria-label={t("Current file progress", "目前檔案進度")}
          value={processor.progress}
          max={100}
        />
      )}
      <ol className="tool-results">
        {items.map((item, i) => (
          <li key={i}>
            <h3>{item.file.name}</h3>
            <p>
              {states[item.state]} · {item.file.size.toLocaleString()}{" "}
              {t("bytes", "位元組")}
            </p>
            {item.error && <p>{item.error}</p>}
            {item.result && (
              <Output
                result={item.result}
                name={
                  item.file.name.replace(/\.[^.]+$/, "") +
                  "." +
                  (target.startsWith("image/") ? target.split("/")[1] : target)
                }
              />
            )}
          </li>
        ))}
      </ol>
      <details>
        <summary>
          {t(
            "Unavailable adapters and acceptance gaps",
            "未提供的轉換器及驗證缺口",
          )}
        </summary>
        <ul>
          <li>
            {t(
              "Documents / PDF: no bundled document engine.",
              "文件／PDF：未附文件引擎。",
            )}
          </li>
          <li>
            {t(
              "Audio / video: no bundled media conversion engine.",
              "音訊／影片：未附媒體轉換引擎。",
            )}
          </li>
          <li>
            {t("Archives: no archive adapter.", "封存檔：未提供封存轉換器。")}
          </li>
          <li>
            {t(
              "YAML / TOML / XML: no verified bundled parser.",
              "YAML／TOML／XML：未附經驗證的剖析器。",
            )}
          </li>
          <li>
            {t(
              "Code / text: only the documented structured-text conversions above. Binary encodings: use the Base64 workspace.",
              "程式碼／文字：只提供上述結構化文字轉換。二進位編碼請使用 Base64 工作區。",
            )}
          </li>
          <li>
            {t(
              "Persistent unlimited queues, pause/resume, destination-space preflight, adapter catalog regex builders and packaged codec acceptance are not available.",
              "尚未提供持久無限佇列、暫停／繼續、目的地空間預檢、轉換器目錄正規表示式建構器及封裝編碼器驗證。",
            )}
          </li>
        </ul>
      </details>
    </section>
  );
}
