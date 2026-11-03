export const MAX_BYTES = 8 * 1024 * 1024;
export class ToolError extends Error {
  constructor(code, offset) {
    super(code);
    this.code = code;
    this.offset = offset;
  }
}
export function bounded(bytes) {
  if (bytes.byteLength > MAX_BYTES) throw new ToolError("size");
  return bytes;
}
export function encodeText(text, encoding = "utf-8") {
  if (text.length > MAX_BYTES) throw new ToolError("size");
  if (encoding === "utf-8") return bounded(new TextEncoder().encode(text));
  if (encoding === "latin1") {
    if ([...text].some((c) => c.codePointAt(0) > 255))
      throw new ToolError("encoding");
    return bounded(Uint8Array.from(text, (c) => c.charCodeAt(0)));
  }
  if (!["utf-16le", "utf-16be"].includes(encoding))
    throw new ToolError("encoding");
  const bytes = new Uint8Array(text.length * 2),
    view = new DataView(bytes.buffer);
  for (let i = 0; i < text.length; i++)
    view.setUint16(i * 2, text.charCodeAt(i), encoding === "utf-16le");
  return bounded(bytes);
}
export function decodeText(bytes, encoding = "utf-8") {
  if (encoding === "latin1") {
    let value = "";
    for (let i = 0; i < bytes.length; i += 8192)
      value += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return value;
  }
  try {
    if (encoding.startsWith("utf-16") && bytes.length % 2) throw Error();
    return new TextDecoder(encoding, { fatal: true, ignoreBOM: true }).decode(
      bytes,
    );
  } catch {
    throw new ToolError("encoding");
  }
}
export function encode64(
  bytes,
  { url = false, padding = true, wrap = 0 } = {},
) {
  bounded(bytes);
  if (!Number.isInteger(wrap) || wrap < 0 || wrap > 4096)
    throw new ToolError("wrap");
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  let result = btoa(binary);
  if (url) result = result.replaceAll("+", "-").replaceAll("/", "_");
  if (!padding) result = result.replace(/=+$/, "");
  return wrap
    ? result.match(new RegExp(`.{1,${wrap}}`, "g"))?.join("\r\n") || ""
    : result;
}
export function decode64(input, { url = false, strict = true } = {}) {
  if (input.length > MAX_BYTES * 1.5) throw new ToolError("size");
  const alphabet = url ? /^[A-Za-z0-9_\-=]*$/ : /^[A-Za-z0-9+/=]*$/;
  const s = strict ? input : input.replace(/[\t\r\n ]/g, "");
  if (!alphabet.test(s)) {
    const allowed = url ? /[A-Za-z0-9_\-=]/ : /[A-Za-z0-9+/=]/;
    throw new ToolError(
      "alphabet",
      [...s].findIndex((c) => !allowed.test(c)),
    );
  }
  if (
    !/^[^=]*={0,2}$/.test(s) ||
    s.length % 4 === 1 ||
    (s.includes("=") && s.length % 4 !== 0) ||
    (strict && s.length % 4 !== 0)
  )
    throw new ToolError("padding");
  const standard = s.replaceAll("-", "+").replaceAll("_", "/");
  let binary;
  try {
    binary = atob(standard);
  } catch {
    throw new ToolError("padding");
  }
  const bytes = bounded(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
  // Canonical re-encoding rejects nonzero trailing pad bits.
  if (encode64(bytes, { url, padding: false }) !== s.replace(/=+$/, ""))
    throw new ToolError("padding");
  return bytes;
}
export function parseDataURL(input) {
  if (input.length > MAX_BYTES * 1.5) throw new ToolError("size");
  const match = /^data:([^,]*),(.*)$/s.exec(input);
  if (!match) throw new ToolError("data-url");
  const parts = match[1].split(";"),
    mime = parts.shift() || "text/plain";
  if (!/^[\w.+-]+\/[\w.+-]+$/.test(mime) || parts.at(-1) !== "base64")
    throw new ToolError("data-url");
  if (parts.slice(0, -1).some((p) => !/^[-\w]+=[-\w.+]+$/.test(p)))
    throw new ToolError("data-url");
  return {
    mime,
    parameters: parts.slice(0, -1),
    bytes: decode64(match[2], { strict: false }),
  };
}
export function sniff(bytes) {
  const eq = (arr, offset = 0) => arr.every((b, i) => bytes[offset + i] === b);
  if (eq([137, 80, 78, 71, 13, 10, 26, 10])) return "image/png";
  if (eq([255, 216, 255])) return "image/jpeg";
  if (eq([82, 73, 70, 70]) && eq([87, 69, 66, 80], 8)) return "image/webp";
  return "application/octet-stream";
}
export function parseDelimited(text, delimiter) {
  if (text.length > MAX_BYTES) throw new ToolError("size");
  const rows = [];
  let row = [],
    cell = "",
    quoted = false,
    closed = false;
  const add = () => {
    row.push(cell);
    cell = "";
    closed = false;
    if (row.length > 1000) throw new ToolError("structure");
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
    } else if (c === '"') {
      if (cell || closed) throw new ToolError("structure");
      quoted = true;
    } else if (c === delimiter) add();
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      add();
      rows.push(row);
      row = [];
      if (rows.length > 100000) throw new ToolError("structure");
    } else {
      if (closed) throw new ToolError("structure");
      cell += c;
    }
  }
  if (quoted) throw new ToolError("structure");
  if (cell || row.length || closed) add();
  if (row.length) rows.push(row);
  if (rows.some((r) => r.length !== rows[0].length))
    throw new ToolError("structure");
  return rows;
}
export function serializeDelimited(rows, delimiter) {
  return rows
    .map((row) =>
      row
        .map((value) => {
          const s = String(value);
          return /["\r\n]/.test(s) || s.includes(delimiter)
            ? '"' + s.replaceAll('"', '""') + '"'
            : s;
        })
        .join(delimiter),
    )
    .join("\r\n");
}
export function convertData(bytes, source, target) {
  const text = decodeText(bounded(bytes));
  let rows;
  if (source === "json") {
    try {
      rows = JSON.parse(text);
    } catch {
      throw new ToolError("structure");
    }
    if (
      !Array.isArray(rows) ||
      rows.length > 100000 ||
      rows.some(
        (row) =>
          !Array.isArray(row) ||
          row.length > 1000 ||
          row.some(
            (v) =>
              !["string", "number", "boolean"].includes(typeof v) && v !== null,
          ),
      )
    )
      throw new ToolError("structure");
    if (rows.some((r) => r.length !== rows[0].length))
      throw new ToolError("structure");
  } else if (source === "csv" || source === "tsv")
    rows = parseDelimited(text, source === "csv" ? "," : "\t");
  else throw new ToolError("unsupported");
  if (!["json", "csv", "tsv"].includes(target))
    throw new ToolError("unsupported");
  const output =
    target === "json"
      ? JSON.stringify(rows, null, 2)
      : serializeDelimited(rows, target === "csv" ? "," : "\t");
  const result = bounded(encodeText(output));
  if (target !== "json") parseDelimited(output, target === "csv" ? "," : "\t");
  else JSON.parse(output);
  return result;
}
export function imageDimensions(bytes, mime) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let w = 0,
    h = 0;
  try {
    if (mime === "image/png") {
      w = v.getUint32(16);
      h = v.getUint32(20);
      let p = 8;
      while (p + 12 <= bytes.length) {
        const length = v.getUint32(p),
          type = String.fromCharCode(...bytes.subarray(p + 4, p + 8));
        if (type === "acTL") throw new ToolError("animation");
        if (length > bytes.length - p - 12) throw Error();
        p += 12 + length;
        if (type === "IEND") break;
      }
    } else if (mime === "image/jpeg") {
      let p = 2;
      while (p + 4 < bytes.length) {
        if (bytes[p++] !== 255) throw Error();
        const marker = bytes[p++];
        if (marker === 217 || marker === 218) break;
        const len = v.getUint16(p);
        if (len < 2) throw Error();
        if ([192, 193, 194].includes(marker)) {
          h = v.getUint16(p + 3);
          w = v.getUint16(p + 5);
          break;
        }
        p += len;
      }
    } else if (mime === "image/webp") {
      const type = String.fromCharCode(...bytes.subarray(12, 16));
      if (type === "VP8X") {
        w = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
        h = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
        if (bytes[20] & 2) throw new ToolError("animation");
      } else if (type === "VP8 ") {
        if (bytes[23] !== 157 || bytes[24] !== 1 || bytes[25] !== 42)
          throw Error();
        w = v.getUint16(26, true) & 16383;
        h = v.getUint16(28, true) & 16383;
      } else if (type === "VP8L") {
        if (bytes[20] !== 47) throw Error();
        const bits = v.getUint32(21, true);
        w = 1 + (bits & 16383);
        h = 1 + ((bits >>> 14) & 16383);
      }
    }
  } catch (e) {
    if (e instanceof ToolError) throw e;
    throw new ToolError("image");
  }
  if (!w || !h || w > 8192 || h > 8192 || w * h > 16000000)
    throw new ToolError("dimensions");
  return { width: w, height: h };
}
