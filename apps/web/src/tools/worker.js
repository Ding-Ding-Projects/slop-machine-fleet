import {
  MAX_BYTES,
  ToolError,
  bounded,
  encodeText,
  decodeText,
  encode64,
  decode64,
  parseDataURL,
  sniff,
  convertData,
  imageDimensions,
} from "./core.mjs";
const hash = async (bytes) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
async function codecs() {
  const result = {};
  if (typeof OffscreenCanvas === "undefined") return result;
  const canvas = new OffscreenCanvas(1, 1);
  for (const mime of ["image/png", "image/jpeg", "image/webp"]) {
    try {
      const blob = await canvas.convertToBlob({ type: mime });
      result[mime] =
        blob.type === mime &&
        sniff(new Uint8Array(await blob.arrayBuffer())) === mime;
    } catch {
      result[mime] = false;
    }
  }
  return result;
}
async function convertImage(bytes, target) {
  const source = sniff(bytes),
    dimensions = imageDimensions(bytes, source);
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(source) ||
    !["image/png", "image/jpeg", "image/webp"].includes(target)
  )
    throw new ToolError("unsupported");
  const bitmap = await createImageBitmap(new Blob([bytes], { type: source }));
  try {
    if (
      bitmap.width !== dimensions.width ||
      bitmap.height !== dimensions.height
    )
      throw new ToolError("image");
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ToolError("unsupported");
    if (target === "image/jpeg") {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(bitmap, 0, 0);
    const blob = await canvas.convertToBlob({ type: target, quality: 0.9 });
    const output = bounded(new Uint8Array(await blob.arrayBuffer()));
    if (blob.type !== target || sniff(output) !== target)
      throw new ToolError("codec");
    const validated = await createImageBitmap(blob);
    try {
      if (
        validated.width !== bitmap.width ||
        validated.height !== bitmap.height
      )
        throw new ToolError("image");
    } finally {
      validated.close();
    }
    return output;
  } finally {
    bitmap.close();
  }
}
self.onmessage = async ({ data }) => {
  try {
    if (data.action === "capabilities") {
      self.postMessage({ ok: true, capabilities: await codecs() });
      return;
    }
    self.postMessage({ progress: 10 });
    if (data.file && data.file.size > MAX_BYTES) throw new ToolError("size");
    let bytes = data.file
      ? new Uint8Array(await data.file.arrayBuffer())
      : encodeText(data.text || "", data.encoding);
    bounded(bytes);
    if (data.file && data.file.size > MAX_BYTES) throw new ToolError("size");
    let output,
      mime = "application/octet-stream",
      text = "",
      parameters = [];
    if (data.action === "encode") {
      text = encode64(bytes, data.options);
      if (data.dataURL) {
        mime = data.mime || sniff(bytes);
        if (!/^[-\w.+]+\/[-\w.+]+$/.test(mime) || mime.length > 255)
          throw new ToolError("data-url");
        text = `data:${mime};base64,${encode64(bytes)}`;
      }
      output = encodeText(text);
      const roundtrip = data.dataURL
        ? parseDataURL(text).bytes
        : decode64(text, { url: data.options.url, strict: false });
      if ((await hash(roundtrip)) !== (await hash(bytes)))
        throw new ToolError("roundtrip");
      mime = "text/plain";
    } else if (data.action === "decode") {
      const source = decodeText(bytes, data.file ? "utf-8" : data.encoding);
      if (/^data:/i.test(source)) {
        const parsed = parseDataURL(source);
        output = parsed.bytes;
        parameters = parsed.parameters;
      } else output = decode64(source, data.options);
      mime = sniff(output);
      try {
        text = decodeText(output, data.encoding);
      } catch {
        text = "";
      }
    } else if (data.action === "convert") {
      if (data.target.startsWith("image/")) {
        output = await convertImage(bytes, data.target);
        mime = data.target;
      } else {
        output = convertData(bytes, data.source, data.target);
        mime = data.target === "json" ? "application/json" : "text/plain";
        text = decodeText(output);
      }
    } else throw new ToolError("unsupported");
    self.postMessage({ progress: 90 });
    const result = {
      ok: true,
      bytes: output,
      mime,
      text: text.slice(0, 65536),
      previewTruncated: text.length > 65536,
      inputSize: bytes.length,
      outputSize: output.length,
      sha256: await hash(output),
      ...(data.action === "encode" || data.action === "decode"
        ? { inputSha256: await hash(bytes) }
        : {}),
      parameters,
      hex: Array.from(output.subarray(0, 128), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join(" "),
    };
    self.postMessage(result, [output.buffer]);
  } catch (error) {
    self.postMessage({
      ok: false,
      code: error instanceof ToolError ? error.code : "processing",
      offset: error instanceof ToolError ? error.offset : undefined,
    });
  }
};
