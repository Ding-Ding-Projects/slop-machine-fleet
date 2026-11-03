import { sha256 } from "@noble/hashes/sha2.js";
import {
  Base64Encoder,
  Base64Decoder,
  Base64Error,
  CHUNK_BYTES,
  createControl,
} from "./codec.mjs";
import { DataURLStripper, dataURLPrefix } from "./data-url.mjs";
const hex = (bytes) =>
  Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
export async function convertStream({
  source,
  sink,
  mode,
  options = {},
  control = createControl(),
  onProgress = () => {},
}) {
  if (!["encode", "decode"].includes(mode)) throw new Base64Error("mode");
  if (mode === "encode" && options.dataURL)
    options = { ...options, url: false, padding: true, wrap: 0 };
  const inputStripper = mode === "decode" ? new DataURLStripper() : null;
  const inputHash = sha256.create(),
    outputHash = sha256.create();
  let inputSize = 0,
    outputSize = 0,
    iteration = 0;
  const transform =
    mode === "encode" ? new Base64Encoder(options) : new Base64Decoder(options);
  const write = async (bytes) => {
    for (let at = 0; at < bytes.length; at += CHUNK_BYTES) {
      await control.checkpoint();
      const part = bytes.subarray(at, at + CHUNK_BYTES);
      await sink.write(part);
      outputHash.update(part);
      outputSize += part.length;
    }
  };
  try {
    if (mode === "encode" && options.dataURL)
      await write(dataURLPrefix(options.mime));
    for await (const chunk of source()) {
      await control.checkpoint();
      if (chunk.length > CHUNK_BYTES) throw new Base64Error("chunk");
      inputHash.update(chunk);
      inputSize += chunk.length;
      const payload = inputStripper ? inputStripper.push(chunk) : chunk;
      if (inputStripper?.mime) {
        options = { ...options, url: false };
        transform.options.url = false;
        if (transform.offset === 0)
          transform.offset = inputStripper.headerLength;
      }
      await write(transform.push(payload));
      onProgress({ phase: "transform", inputSize, outputSize });
      if (++iteration % 8 === 0)
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    await write(
      transform.push(
        inputStripper
          ? inputStripper.push(new Uint8Array(), true)
          : new Uint8Array(),
        true,
      ),
    );
    await control.checkpoint();
    await sink.seal();
    const inputSha256 = hex(inputHash.digest()),
      outputSha256 = hex(outputHash.digest()),
      readHash = sha256.create(),
      roundHash = sha256.create();
    const decoder = new Base64Decoder({ url: options.url, strict: false }),
      encoder =
        mode === "decode"
          ? new Base64Encoder({ url: options.url, padding: options.padding })
          : null;
    let verifiedBytes = 0;
    const verificationStripper =
      mode === "encode" && options.dataURL ? new DataURLStripper() : null;
    const consume = (bytes) =>
      roundHash.update(
        decoder.push(
          verificationStripper ? verificationStripper.push(bytes) : bytes,
        ),
      );
    for await (const chunk of sink.chunks()) {
      await control.checkpoint();
      if (chunk.length > CHUNK_BYTES) throw new Base64Error("chunk");
      readHash.update(chunk);
      verifiedBytes += chunk.length;
      consume(encoder ? encoder.push(chunk) : chunk);
      onProgress({ phase: "verify", inputSize, outputSize, verifiedBytes });
    }
    if (encoder) consume(encoder.push(new Uint8Array(), true));
    if (verificationStripper)
      roundHash.update(
        decoder.push(verificationStripper.push(new Uint8Array(), true)),
      );
    roundHash.update(decoder.push(new Uint8Array(), true));
    if (
      hex(readHash.digest()) !== outputSha256 ||
      hex(roundHash.digest()) !==
        (mode === "encode" ? inputSha256 : outputSha256) ||
      verifiedBytes !== outputSize
    )
      throw new Base64Error("verification");
    await control.checkpoint();
    await sink.commit();
    return {
      mode,
      inputSize,
      outputSize,
      inputSha256,
      outputSha256,
      verified: true,
      options: {
        url: !!options.url,
        padding: options.padding !== false,
        strict: options.strict !== false,
        wrap: options.wrap || 0,
        dataURL: !!options.dataURL || !!inputStripper?.mime,
        encoding: options.encoding || "utf-8",
        ...(options.mime || inputStripper?.mime
          ? { mime: inputStripper?.mime || options.mime }
          : {}),
      },
      ...(inputStripper?.mime
        ? {
            dataURL: {
              mime: inputStripper.mime,
              parameters: inputStripper.parameters,
            },
          }
        : {}),
    };
  } catch (error) {
    await sink.abort();
    throw error;
  } finally {
    inputHash.destroy();
    outputHash.destroy();
  }
}
