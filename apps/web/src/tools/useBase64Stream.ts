import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  removeTemporary,
  claimTemporary,
  acquireAndStart,
  storageBudget,
} from "../../../../packages/shared/local-base64/storage.mjs";
import { textByteLength } from "../../../../packages/shared/local-base64/data-url.mjs";
import { zipPlan } from "../../../../packages/shared/local-base64/archive.mjs";
import { createRunLifecycle } from "../../../../packages/shared/local-base64/lifecycle.mjs";
type Claim = { id: string; owner: string; expectedBytes: number };
export type StreamResult = {
  id: string;
  file: File;
  result: {
    mode: string;
    inputSize: number;
    outputSize: number;
    inputSha256: string;
    outputSha256: string;
    verified: boolean;
    mime?: string;
    dataURL?: { mime: string; parameters: string[] };
    options: Record<string, unknown>;
  };
};
export function useBase64Stream() {
  const worker = useRef<Worker | null>(null),
    generation = useRef(0),
    owned = useRef(new Map<string, Claim>()),
    activeId = useRef<string | null>(null),
    alive = useRef(true),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    pending = useRef<((error: Error) => void) | null>(null);
  const [busy, setBusy] = useState(false),
    [paused, setPaused] = useState(false),
    [progress, setProgress] = useState({
      phase: "transform",
      inputSize: 0,
      outputSize: 0,
      verifiedBytes: 0,
      total: 0,
    }),
    [cleanupError, setCleanupError] = useState(false);
  const retire = useCallback(async (id: string) => {
    const claim = owned.current.get(id);
    if (!claim) return;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await removeTemporary(claim);
        owned.current.delete(id);
        return;
      } catch {
        if (attempt < 2)
          await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    if (alive.current) setCleanupError(true);
  }, []);
  const lifecycle = useMemo(
    () =>
      createRunLifecycle({
        generation,
        worker,
        timer,
        pending,
        activeId,
        retire,
        onReset: () => {
          if (alive.current) {
            setBusy(false);
            setPaused(false);
          }
        },
        onPause: (value: boolean) => {
          if (alive.current) setPaused(value);
        },
      }),
    [retire],
  );
  const stop = lifecycle.stop;
  const dispose = useCallback(() => {
    stop();
    for (const id of owned.current.keys()) void retire(id);
  }, [stop, retire]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      dispose();
    };
  }, [dispose]);
  const cancel = lifecycle.cancel;
  const run = useCallback(
    (
      file: File,
      mode: "encode" | "decode" | "zip",
      options: Record<string, unknown>,
      consent: boolean,
    ) => {
      stop();
      const current = generation.current;
      setBusy(true);
      setPaused(false);
      setProgress({
        phase: "transform",
        inputSize: 0,
        outputSize: 0,
        verifiedBytes: 0,
        total: file.size,
      });
      return new Promise<StreamResult>((resolve, reject) => {
        pending.current = reject;
        let expectedBytes: number;
        try {
          const size =
            typeof options.textPayload === "string"
              ? textByteLength(
                  options.textPayload,
                  mode === "decode"
                    ? "utf-8"
                    : String(options.encoding || "utf-8"),
                )
              : file.size;
          expectedBytes =
            mode === "zip"
              ? zipPlan(options.files as any).expectedBytes
              : storageBudget(size, mode, Number(options.wrap) || 0);
        } catch (error) {
          lifecycle.finish(current);
          reject(error);
          return;
        }
        void acquireAndStart({
          acquire: () => claimTemporary({ consent, expectedBytes }),
          retain: (claim: Claim) => {
            owned.current.set(claim.id, claim);
            if (current === generation.current) activeId.current = claim.id;
          },
          isCurrent: () => alive.current && current === generation.current,
          retire,
          start: (claim: Claim) => {
            const active = new Worker(
              new URL("./base64-stream-worker.js", import.meta.url),
              { type: "module" },
            );
            worker.current = active;
            const finish = () => lifecycle.finish(current);
            active.onmessage = ({ data }) => {
              if (current !== generation.current) return;
              if (data.type === "progress") {
                setProgress(data);
                return;
              }
              if (data.type === "paused") {
                setPaused(true);
                return;
              }
              if (data.type === "resumed") {
                setPaused(false);
                return;
              }
              if (data.type === "complete") {
                activeId.current = null;
                finish();
                resolve(data);
                return;
              }
              if (data.type === "error") {
                const id = activeId.current;
                activeId.current = null;
                finish();
                if (id) void retire(id);
                reject(
                  Error(
                    data.code +
                      (Number.isInteger(data.offset) ? ":" + data.offset : ""),
                  ),
                );
              }
            };
            active.onerror = () => {
              if (current !== generation.current) return;
              const id = activeId.current;
              activeId.current = null;
              finish();
              if (id) void retire(id);
              reject(Error("processing"));
            };
            active.postMessage({ type: "start", file, mode, options, claim });
          },
        }).catch((error: Error) => {
          if (current !== generation.current) return;
          worker.current?.terminate();
          worker.current = null;
          activeId.current = null;
          pending.current = null;
          setBusy(false);
          setPaused(false);
          reject(error);
        });
      });
    },
    [stop, retire, lifecycle],
  );
  return {
    run,
    cancel,
    dispose,
    busy,
    paused,
    progress,
    cleanupError,
    pause: () => worker.current?.postMessage({ type: "pause" }),
    resume: () => worker.current?.postMessage({ type: "resume" }),
    release: retire,
  };
}
