export const CHUNK_BYTES = 65536;
export class Base64Error extends Error {
  constructor(code, offset) {
    super(code);
    this.code = code;
    this.offset = offset;
  }
}
const STANDARD =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
export function optionsOf(options = {}) {
  const value = {
    url: false,
    padding: true,
    wrap: 0,
    strict: true,
    ...options,
  };
  if (!Number.isInteger(value.wrap) || value.wrap < 0 || value.wrap > 4096)
    throw new Base64Error("wrap");
  return value;
}
export class Base64Encoder {
  constructor(options = {}) {
    this.options = optionsOf(options);
    this.tail = new Uint8Array();
    this.column = 0;
    this.finished = false;
  }
  push(chunk, final = false) {
    if (this.finished) throw new Base64Error("finished");
    if (!(chunk instanceof Uint8Array) || chunk.length > CHUNK_BYTES)
      throw new Base64Error("chunk");
    const input = new Uint8Array(this.tail.length + chunk.length);
    input.set(this.tail);
    input.set(chunk, this.tail.length);
    const end = final ? input.length : input.length - (input.length % 3);
    const alphabet = this.options.url ? STANDARD.slice(0, 62) + "-_" : STANDARD;
    let output = "";
    for (let i = 0; i < end; i += 3) {
      const a = input[i],
        b = input[i + 1],
        c = input[i + 2];
      output +=
        alphabet[a >>> 2] +
        alphabet[((a & 3) << 4) | ((b ?? 0) >>> 4)] +
        (b === undefined
          ? this.options.padding
            ? "="
            : ""
          : alphabet[((b & 15) << 2) | ((c ?? 0) >>> 6)]) +
        (c === undefined
          ? this.options.padding
            ? "="
            : ""
          : alphabet[c & 63]);
    }
    this.tail = input.slice(end);
    if (final) this.finished = true;
    if (this.options.wrap) {
      let wrapped = "";
      for (const char of output) {
        if (this.column === this.options.wrap) {
          wrapped += "\r\n";
          this.column = 0;
        }
        wrapped += char;
        this.column++;
      }
      output = wrapped;
    }
    return new TextEncoder().encode(output);
  }
}
export class Base64Decoder {
  constructor(options = {}) {
    this.options = optionsOf(options);
    this.pending = [];
    this.offset = 0;
    this.ended = false;
    this.finished = false;
  }
  push(chunk, final = false) {
    if (this.finished) throw new Base64Error("finished");
    if (!(chunk instanceof Uint8Array) || chunk.length > CHUNK_BYTES * 4)
      throw new Base64Error("chunk");
    const alphabet = this.options.url ? STANDARD.slice(0, 62) + "-_" : STANDARD;
    const output = [];
    const flush = (group) => {
      const [a, b, c, d] = group;
      if (a < 0 || b < 0 || (c === -1 && d !== -1))
        throw new Base64Error("padding", this.offset - 1);
      if ((c === -1 && b & 15) || (d === -1 && c >= 0 && c & 3))
        throw new Base64Error("padding", this.offset - 1);
      output.push((a << 2) | (b >>> 4));
      if (c >= 0) output.push(((b & 15) << 4) | (c >>> 2));
      if (d >= 0) output.push(((c & 3) << 6) | d);
      if (c === -1 || d === -1) this.ended = true;
    };
    for (const byte of chunk) {
      const at = this.offset++;
      if ([9, 10, 13, 32].includes(byte) && !this.options.strict) continue;
      if (this.ended) throw new Base64Error("padding", at);
      const value =
        byte === 61 ? -1 : alphabet.indexOf(String.fromCharCode(byte));
      if (value < 0 && byte !== 61) throw new Base64Error("alphabet", at);
      this.pending.push(value);
      if (this.pending.length === 4) {
        flush(this.pending);
        this.pending = [];
      }
    }
    if (final) {
      if (this.pending.length) {
        if (
          this.options.strict ||
          this.pending.length === 1 ||
          this.pending.some((x) => x < 0)
        )
          throw new Base64Error("padding", this.offset);
        while (this.pending.length < 4) this.pending.push(-1);
        flush(this.pending);
      }
      this.pending = [];
      this.finished = true;
    }
    return Uint8Array.from(output);
  }
}
export async function* blobChunks(blob) {
  if (!Number.isSafeInteger(blob.size) || blob.size < 0)
    throw new Base64Error("size");
  for (let offset = 0; offset < blob.size; offset += CHUNK_BYTES)
    yield new Uint8Array(
      await blob
        .slice(offset, Math.min(offset + CHUNK_BYTES, blob.size))
        .arrayBuffer(),
    );
}
export function createControl() {
  let paused = false,
    cancelled = false,
    wake = null;
  return {
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
      wake?.();
      wake = null;
    },
    cancel() {
      cancelled = true;
      wake?.();
      wake = null;
    },
    get paused() {
      return paused;
    },
    async checkpoint() {
      while (paused && !cancelled)
        await new Promise((resolve) => {
          wake = resolve;
        });
      if (cancelled) throw new Base64Error("cancelled");
    },
  };
}
