import React from "react";
import { useUI } from "../preferences";
import { download, Result } from "./useProcessor";
export function useErrors() {
  const { t } = useUI();
  return (error: unknown) => {
    const [code, offset] = String(
      error instanceof Error ? error.message : error,
    ).split(":");
    const messages: Record<string, [string, string]> = {
      size: [
        "Input or output exceeds the 8 MiB limit.",
        "輸入或輸出超過 8 MiB 上限。",
      ],
      alphabet: [
        "A character is outside the selected alphabet.",
        "有字元不屬於所選編碼字母表。",
      ],
      padding: [
        "Invalid padding or noncanonical trailing bits.",
        "補位或結尾位元無效。",
      ],
      encoding: [
        "The content cannot be represented in this encoding.",
        "內容無法以所選字元編碼表示。",
      ],
      "data-url": [
        "The data URL header or encoding is invalid.",
        "資料網址標頭或編碼無效。",
      ],
      "data-url-percent": [
        "Malformed percent escape in the data URL.",
        "資料網址的百分比跳脫序列無效。",
      ],
      "data-url-character": [
        "This data URL byte must be percent-encoded.",
        "此資料網址位元組必須使用百分比編碼。",
      ],
      structure: [
        "Use a rectangular array of scalar values or a consistently quoted table.",
        "請使用每行欄數相同的純值陣列或正確加引號的表格。",
      ],
      dimensions: [
        "Image dimensions are invalid or exceed 8192 pixels per side or 16 megapixels.",
        "圖片尺寸無效，或超過每邊 8192 像素或 1600 萬像素。",
      ],
      animation: ["Animated images are not supported.", "不支援動畫圖片。"],
      image: ["The image could not be validated.", "未能驗證圖片。"],
      codec: [
        "This browser cannot produce the selected image format.",
        "此瀏覽器無法產生所選圖片格式。",
      ],
      unsupported: [
        "This capability is unavailable in this browser.",
        "此瀏覽器無法使用此功能。",
      ],
      cancelled: [
        "Cancelled. Originals are unchanged.",
        "已取消，原檔案保持不變。",
      ],
      timeout: [
        "Processing exceeded 30 seconds and was stopped.",
        "處理超過 30 秒，已停止。",
      ],
      processing: [
        "Processing failed. No partial output was saved.",
        "處理失敗，未儲存任何不完整輸出。",
      ],
      clipboard: [
        "Clipboard access is unavailable. Use the download action.",
        "無法存取剪貼簿，請使用下載功能。",
      ],
    };
    const pair = messages[code] || messages.processing;
    return (
      t(...pair) +
      (offset !== undefined ? ` (${t("offset", "位置")}: ${offset})` : "")
    );
  };
}
export function Output({ result, name }: { result: Result; name: string }) {
  const { t, notice } = useUI(),
    message = useErrors();
  return (
    <section
      className="tool-output"
      aria-label={t("Conversion result", "轉換結果")}
    >
      <dl>
        <div>
          <dt>{t("Input bytes", "輸入位元組")}</dt>
          <dd>{result.inputSize.toLocaleString()}</dd>
        </div>
        <div>
          <dt>{t("Output bytes", "輸出位元組")}</dt>
          <dd>{result.outputSize.toLocaleString()}</dd>
        </div>
        <div>
          <dt>SHA-256</dt>
          <dd className="tool-hash">{result.sha256}</dd>
        </div>
      </dl>
      <label>
        {t("Safe preview (text or hexadecimal)", "安全預覽（文字或十六進位）")}
        <textarea readOnly value={result.text || result.hex} rows={6} />
      </label>
      {result.previewTruncated && (
        <p>
          {t(
            "Preview limited to 65,536 characters. The download contains the complete result.",
            "預覽限於 65,536 個字元，下載包含完整結果。",
          )}
        </p>
      )}
      <div className="tool-actions">
        <button type="button" onClick={() => download(result, name)}>
          {t("Download result", "下載結果")}
        </button>
        {result.text && !result.previewTruncated && (
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(result.text);
                notice(t("Copied.", "已複製。"));
              } catch {
                notice(message(Error("clipboard")), true);
              }
            }}
          >
            {t("Copy text", "複製文字")}
          </button>
        )}
      </div>
    </section>
  );
}
