import React, { useEffect, useRef, useState } from "react";
import { useUI } from "../preferences";
import { StreamResult } from "./useBase64Stream";
import { decodeText, imageDimensions } from "./core.mjs";
import {
  detectedMedia,
  previewLabel,
  decodeTextPreview,
} from "../../../../packages/shared/local-base64/preview.mjs";
export type StreamEntry = {
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
export function StreamOutput({ entry }: { entry: StreamEntry }) {
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
      const decoded = decodeTextPreview(
        bytes,
        output.result.mode === "encode"
          ? "utf-8"
          : String(output.result.options.encoding || "utf-8"),
        output.file.size > bytes.length,
      );
      setPreview(
        decoded.text +
          (decoded.truncated
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
