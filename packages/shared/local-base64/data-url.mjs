import { Base64Error } from "./codec.mjs";
export function dataURLPrefix(mime = "application/octet-stream") {
  if (
    typeof mime !== "string" ||
    mime.length > 255 ||
    !/^[-\w.+]+\/[-\w.+]+$/.test(mime)
  )
    throw new Base64Error("data-url");
  return new TextEncoder().encode("data:" + mime + ";base64,");
}
export class DataURLStripper {
  constructor() {
    this.pending = new Uint8Array();
    this.ready = false;
    this.mime = null;
    this.parameters = [];
    this.headerLength = 0;
  }
  push(chunk, final = false) {
    if (this.ready) return chunk;
    const combined = new Uint8Array(this.pending.length + chunk.length);
    combined.set(this.pending);
    combined.set(chunk, this.pending.length);
    if (combined.length < 5 && !final) {
      this.pending = combined;
      return new Uint8Array();
    }
    const starts = String.fromCharCode(...combined.subarray(0, 5)) === "data:";
    if (!starts) {
      this.ready = true;
      this.pending = new Uint8Array();
      return combined;
    }
    const comma = combined.indexOf(44);
    if (comma < 0) {
      if (combined.length > 4096 || final) throw new Base64Error("data-url");
      this.pending = combined;
      return new Uint8Array();
    }
    if (comma > 4096) throw new Base64Error("data-url");
    const header = new TextDecoder("utf-8", { fatal: true }).decode(
        combined.subarray(5, comma),
      ),
      parts = header.split(";"),
      mime = parts.shift() || "text/plain";
    dataURLPrefix(mime);
    if (
      parts.pop() !== "base64" ||
      parts.some((value) => !/^[-\w]+=[-\w.+]+$/.test(value))
    )
      throw new Base64Error("data-url");
    this.mime = mime;
    this.parameters = parts;
    this.headerLength = comma + 1;
    this.ready = true;
    this.pending = new Uint8Array();
    return combined.subarray(comma + 1);
  }
}
export async function* encodeTextChunks(text, encoding = "utf-8") {
  if (typeof text !== "string") throw new Base64Error("encoding");
  if (!["utf-8", "utf-16le", "utf-16be", "latin1"].includes(encoding))
    throw new Base64Error("encoding");
  for (let start = 0; start < text.length; ) {
    let end = Math.min(start + 16384, text.length);
    if (
      encoding === "utf-8" &&
      end < text.length &&
      text.charCodeAt(end - 1) >= 0xd800 &&
      text.charCodeAt(end - 1) <= 0xdbff
    )
      end--;
    const part = text.slice(start, end);
    let bytes;
    if (encoding === "utf-8") bytes = new TextEncoder().encode(part);
    else if (encoding === "latin1") {
      bytes = new Uint8Array(part.length);
      for (let i = 0; i < part.length; i++) {
        const code = part.charCodeAt(i);
        if (code > 255) throw new Base64Error("encoding", start + i);
        bytes[i] = code;
      }
    } else {
      bytes = new Uint8Array(part.length * 2);
      const view = new DataView(bytes.buffer);
      for (let i = 0; i < part.length; i++)
        view.setUint16(i * 2, part.charCodeAt(i), encoding === "utf-16le");
    }
    yield bytes;
    start = end;
  }
}
export function textByteLength(text, encoding = "utf-8") {
  if (!["utf-8", "utf-16le", "utf-16be", "latin1"].includes(encoding))
    throw new Base64Error("encoding");
  if (encoding.startsWith("utf-16")) return text.length * 2;
  let length = 0;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (encoding === "latin1") {
      if (code > 255) throw new Base64Error("encoding", index);
      length++;
    } else if (code < 128) length++;
    else if (code < 2048) length += 2;
    else if (
      code >= 0xd800 &&
      code <= 0xdbff &&
      index + 1 < text.length &&
      text.charCodeAt(index + 1) >= 0xdc00 &&
      text.charCodeAt(index + 1) <= 0xdfff
    ) {
      length += 4;
      index++;
    } else length += 3;
  }
  return length;
}
