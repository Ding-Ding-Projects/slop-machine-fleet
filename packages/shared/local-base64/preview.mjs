export function detectedMedia(bytes) {
  const has = (values, at = 0) =>
      values.every((value, index) => bytes[at + index] === value),
    ascii = (text, at = 0) =>
      has(
        Array.from(text, (value) => value.charCodeAt(0)),
        at,
      );
  if (has([137, 80, 78, 71, 13, 10, 26, 10])) return "image/png";
  if (has([255, 216, 255])) return "image/jpeg";
  if (ascii("RIFF") && ascii("WEBP", 8)) return "image/webp";
  if (ascii("RIFF") && ascii("WAVE", 8)) return "audio/wav";
  if (ascii("fLaC")) return "audio/flac";
  if (ascii("ID3") || (bytes[0] === 255 && (bytes[1] & 0xe6) === 0xe2))
    return "audio/mpeg";
  if (ascii("OggS")) return "audio/ogg";
  if (ascii("ftyp", 4)) return "video/mp4";
  if (has([26, 69, 223, 163])) return "video/webm";
  return null;
}
export function previewLabel(mime) {
  return mime?.startsWith("image/")
    ? "image"
    : mime?.startsWith("audio/")
      ? "audio"
      : mime?.startsWith("video/")
        ? "video"
        : "text";
}

export function decodeTextPreview(
  bytes,
  encoding = "utf-8",
  truncated = false,
) {
  if (!(bytes instanceof Uint8Array) || bytes.length > 65536)
    throw new RangeError("Preview exceeds its byte bound");
  if (!["utf-8", "utf-16le", "utf-16be", "latin1"].includes(encoding))
    throw new TypeError("Unsupported preview encoding");
  if (encoding === "latin1") {
    let text = "";
    for (let offset = 0; offset < bytes.length; offset += 8192)
      text += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    return { text, truncated };
  }
  // A bounded prefix is not end-of-input: buffer only an incomplete final unit.
  // Fatal decoding still rejects malformed interior bytes and terminal input.
  const decoder = new TextDecoder(encoding, { fatal: true, ignoreBOM: true });
  return { text: decoder.decode(bytes, { stream: truncated }), truncated };
}
