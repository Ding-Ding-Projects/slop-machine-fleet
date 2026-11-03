import React, { useState } from "react";
import { useUI } from "../preferences";
import { Base64Tool } from "./Base64Tool";
import { Converter } from "./Converter";
import "./tools.css";
export function Tools() {
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
      {active === "base64" ? <Base64Tool /> : <Converter />}
    </main>
  );
}
export default Tools;
