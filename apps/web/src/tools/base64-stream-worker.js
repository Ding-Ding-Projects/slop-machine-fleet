import {
  blobChunks,
  createControl,
} from "../../../../packages/shared/local-base64/codec.mjs";
import { convertStream } from "../../../../packages/shared/local-base64/stream.mjs";
import {
  createTemporarySink,
  storageBudget,
} from "../../../../packages/shared/local-base64/storage.mjs";
let control = null;
self.onmessage = async ({ data }) => {
  if (data.type === "pause") {
    control?.pause();
    self.postMessage({ type: "paused" });
    return;
  }
  if (data.type === "resume") {
    control?.resume();
    self.postMessage({ type: "resumed" });
    return;
  }
  if (data.type === "cancel") {
    control?.cancel();
    return;
  }
  if (data.type !== "start" || control) return;
  control = createControl();
  let sink;
  try {
    const id = crypto.randomUUID();
    self.postMessage({ type: "temporary", id });
    sink = await createTemporarySink({
      consent: data.consent,
      expectedBytes: storageBudget(
        data.file.size,
        data.mode,
        data.options.wrap,
      ),
      id,
    });
    await control.checkpoint();
    let last = 0;
    const result = await convertStream({
      source: () => blobChunks(data.file),
      sink,
      mode: data.mode,
      options: data.options,
      control,
      onProgress: (value) => {
        if (performance.now() - last > 100) {
          last = performance.now();
          self.postMessage({
            type: "progress",
            ...value,
            total: data.file.size,
          });
        }
      },
    });
    const file = await sink.file();
    self.postMessage({ type: "complete", id, result, file });
  } catch (error) {
    await sink?.abort();
    self.postMessage({
      type: "error",
      code: error.code || "processing",
      offset: error.offset,
    });
  } finally {
    control = null;
  }
};
