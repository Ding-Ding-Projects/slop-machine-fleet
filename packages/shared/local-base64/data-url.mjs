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
// RFC 2397 imports RFC 2396 urlchar; percent escapes represent octets, not UTF-8 text.
const URL_BYTE = /^[A-Za-z0-9\-_.!~*'();/?:@&=+$,]$/;
export class PercentOctetDecoder {
  constructor(offset = 0) {
    this.offset = offset;
    this.digits = 0;
    this.first = 0;
    this.escapeOffset = 0;
    this.finished = false;
  }
  push(chunk, final = false) {
    if (this.finished) throw new Base64Error("finished");
    if (!(chunk instanceof Uint8Array) || chunk.length > 69632)
      throw new Base64Error("chunk");
    const output = new Uint8Array(chunk.length);
    let length = 0;
    for (const byte of chunk) {
      const at = this.offset++;
      if (this.digits) {
        const digit =
          byte >= 48 && byte <= 57
            ? byte - 48
            : byte >= 65 && byte <= 70
              ? byte - 55
              : byte >= 97 && byte <= 102
                ? byte - 87
                : -1;
        if (digit < 0)
          throw new Base64Error("data-url-percent", this.escapeOffset);
        if (this.digits === 1) {
          this.first = digit;
          this.digits = 2;
        } else {
          output[length++] = (this.first << 4) | digit;
          this.digits = 0;
        }
      } else if (byte === 37) {
        this.escapeOffset = at;
        this.digits = 1;
      } else {
        if (byte > 127 || !URL_BYTE.test(String.fromCharCode(byte)))
          throw new Base64Error("data-url-character", at);
        output[length++] = byte;
      }
    }
    if (final) {
      if (this.digits)
        throw new Base64Error("data-url-percent", this.escapeOffset);
      this.finished = true;
    }
    return output.subarray(0, length);
  }
}
function headerPart(value, offset) {
  const bytes = new PercentOctetDecoder(offset).push(
    new TextEncoder().encode(value),
    true,
  );
  return String.fromCharCode(...bytes);
}
export function parsePlainDataHeader(header) {
  const pieces = header.split(";"),
    rawMime = pieces.shift(),
    mime = rawMime ? headerPart(rawMime, 5) : "text/plain";
  const token = /^[!#$%&'*+\-.^_`|~{}A-Za-z0-9]+$/;
  const types = mime.split("/");
  if (types.length !== 2 || !types.every((value) => token.test(value)))
    throw new Base64Error("data-url");
  const parameters = [];
  let offset = 5 + rawMime.length + 1;
  for (const part of pieces) {
    const equal = part.indexOf("=");
    if (equal <= 0) throw new Base64Error("data-url");
    const name = headerPart(part.slice(0, equal), offset),
      value = headerPart(part.slice(equal + 1), offset + equal + 1);
    if (!token.test(name) || /[\x00-\x1f\x7f]/.test(value))
      throw new Base64Error("data-url");
    parameters.push(name + "=" + value);
    offset += part.length + 1;
  }
  if (!rawMime && !parameters.some((value) => /^charset=/i.test(value)))
    parameters.unshift("charset=US-ASCII");
  return { mime, parameters };
}
export class DataURLStripper {
  constructor() {
    this.pending = new Uint8Array();
    this.ready = false;
    this.mime = null;
    this.parameters = [];
    this.headerLength = 0;
    this.base64 = null;
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
    const starts =
      String.fromCharCode(...combined.subarray(0, 5)).toLowerCase() === "data:";
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
    this.base64 = parts.at(-1) === "base64";
    if (this.base64) {
      dataURLPrefix(mime);
      if (
        parts.pop() !== "base64" ||
        parts.some((value) => !/^[-\w]+=[-\w.+]+$/.test(value))
      )
        throw new Base64Error("data-url");
      this.mime = mime;
      this.parameters = parts;
    } else {
      const parsed = parsePlainDataHeader(header);
      this.mime = parsed.mime;
      this.parameters = parsed.parameters;
    }
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
