import React, { useLayoutEffect, useRef, useState } from "react";
import { useUI } from "../preferences";
import { Base64Tool } from "./Base64Tool";
import { Converter } from "./Converter";
import "./tools.css";
import { createSafetyRegistry } from "./safety.mjs";
import { SafetyContext, ToolSafety, ToolLifecycle } from "./Safety";
export type { ToolSafety, ToolLifecycle } from "./Safety";
export function Tools({
  onSafety,
  onLifecycle,
}: {
  onSafety?: (state: ToolSafety) => void;
  onLifecycle?: (controls: ToolLifecycle | null) => void;
} = {}) {
  const [registry] = useState(() =>
    createSafetyRegistry(["base64", "converter"]),
  );
  const [epoch, setEpoch] = useState(0),
    callbacks = useRef({ onSafety, onLifecycle });
  callbacks.current = { onSafety, onLifecycle };
  useLayoutEffect(() => {
    const unsubscribe = registry.subscribe((state: ToolSafety) =>
      callbacks.current.onSafety?.(state),
    );
    callbacks.current.onLifecycle?.({
      canLeave: () => registry.canLeave(),
      discard: () => {
        registry.discard();
        setEpoch((value) => value + 1);
      },
    });
    return () => {
      unsubscribe();
      callbacks.current.onSafety?.({
        known: false,
        dirty: false,
        pendingWrites: false,
      });
      callbacks.current.onLifecycle?.(null);
    };
  }, [registry]);
  const { t } = useUI(),
    [active, setActive] = useState<"base64" | "converter">("base64");
  return (
    <main className="local-tools">
      <header>
        <h1>{t("Local tools", "本機工具")}</h1>
        <p>
          {t(
            "Private, explicit conversions on this device. No content uploads.",
            "在此裝置進行明確、私密的轉換，內容不會上傳。",
          )}
        </p>
      </header>
      <nav
        className="tool-actions"
        aria-label={t("Local tool selection", "本機工具選擇")}
      >
        <button
          aria-pressed={active === "base64"}
          onClick={() => setActive("base64")}
        >
          {t("Base64 toolkit", "Base64 工具")}
        </button>
        <button
          aria-pressed={active === "converter"}
          onClick={() => setActive("converter")}
        >
          {t("File converter", "檔案轉換器")}
        </button>
      </nav>
      <SafetyContext.Provider value={registry}>
        <div hidden={active !== "base64"} key={"base64-" + epoch}>
          <Base64Tool />
        </div>
        <div hidden={active !== "converter"} key={"converter-" + epoch}>
          <Converter />
        </div>
      </SafetyContext.Provider>
    </main>
  );
}
export default Tools;
