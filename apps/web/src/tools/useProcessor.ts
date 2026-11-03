import { useCallback, useEffect, useRef, useState } from "react";
export type Result = {
  bytes: Uint8Array;
  mime: string;
  text: string;
  previewTruncated: boolean;
  inputSize: number;
  outputSize: number;
  sha256: string;
  hex: string;
  parameters: string[];
};
export function useProcessor() {
  const worker = useRef<Worker | null>(null),
    generation = useRef(0),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    reject = useRef<((reason: Error) => void) | null>(null);
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0);
  const stop = useCallback(() => {
    generation.current++;
    worker.current?.terminate();
    worker.current = null;
    clearTimeout(timer.current);
    reject.current?.(Error("cancelled"));
    reject.current = null;
  }, []);
  const cancel = useCallback(() => {
    stop();
    setBusy(false);
    setProgress(0);
  }, [stop]);
  useEffect(() => () => stop(), [stop]);
  const run = useCallback(
    (request: Record<string, unknown>) => {
      stop();
      const current = generation.current;
      setBusy(true);
      setProgress(0);
      return new Promise<Result>((resolve, fail) => {
        reject.current = fail;
        let active: Worker;
        try {
          active = new Worker(new URL("./worker.js", import.meta.url), {
            type: "module",
          });
        } catch {
          setBusy(false);
          reject.current = null;
          fail(Error("unsupported"));
          return;
        }
        worker.current = active;
        const finish = () => {
          active.terminate();
          clearTimeout(timer.current);
          worker.current = null;
          reject.current = null;
          setBusy(false);
        };
        active.onmessage = ({ data }) => {
          if (current !== generation.current) return;
          if (data.progress) {
            setProgress(data.progress);
            return;
          }
          finish();
          if (data.ok) {
            setProgress(100);
            resolve(data);
          } else
            fail(
              Error(
                data.code +
                  (Number.isInteger(data.offset) ? `:${data.offset}` : ""),
              ),
            );
        };
        active.onerror = () => {
          if (current !== generation.current) return;
          finish();
          fail(Error("processing"));
        };
        timer.current = setTimeout(() => {
          if (current !== generation.current) return;
          finish();
          fail(Error("timeout"));
        }, 30000);
        active.postMessage(request);
      });
    },
    [stop],
  );
  return { run, cancel, busy, progress };
}
export function download(result: Result, name: string) {
  const bytes = new Uint8Array(result.bytes);
  const url = URL.createObjectURL(
    new Blob([bytes.buffer], { type: result.mime }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download =
    name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 180) ||
    "converted";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
