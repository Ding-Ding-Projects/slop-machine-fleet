import React from "react";
import { useUI } from "./preferences";
export function Settings() {
  const { prefs, set, t, storageError } = useUI();
  return (
    <section className="settings">
      <span className="eyebrow">
        {t("Your reading experience", "你的閱讀體驗")}
      </span>
      <h1>{t("Documentation settings", "文件設定")}</h1>
      <p>
        {t(
          "These controls affect this documentation companion only. Complete required settings coverage remains unfinished.",
          "這些控制只影響此文件伴隨介面，完整所需設定仍未完成。",
        )}
      </p>
      <div className="settings-grid">
        <label>
          {t("Language", "語言")}
          <select
            value={prefs.language}
            onChange={(e) =>
              set({ language: e.target.value as typeof prefs.language })
            }
          >
            <option value="en">English</option>
            <option value="yue">廣東話</option>
            <option value="both">English · 廣東話</option>
          </select>
        </label>
        <label>
          {t("Appearance", "外觀")}
          <select
            value={prefs.theme}
            onChange={(e) =>
              set({ theme: e.target.value as typeof prefs.theme })
            }
          >
            <option value="system">{t("Follow device", "跟隨裝置")}</option>
            <option value="dark">{t("Dark", "深色")}</option>
            <option value="light">{t("Light", "淺色")}</option>
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={prefs.reduceMotion}
            onChange={(e) => set({ reduceMotion: e.target.checked })}
          />
          {t("Reduce motion", "減少動態效果")}
        </label>
      </div>
      <button
        onClick={() =>
          set({ language: "en", theme: "system", reduceMotion: false })
        }
      >
        {t("Restore reading defaults", "還原閱讀預設值")}
      </button>
      {storageError && (
        <p role="alert">
          {t(
            "Settings could not be saved on this device.",
            "未能在此裝置儲存設定。",
          )}
        </p>
      )}
      <aside className="notice">
        <h2>{t("Public documentation privacy", "公開文件私隱")}</h2>
        <p>
          {t(
            "No sign-in, personal-wording import, controller connection or credentials are used here. Source articles retain their original language. The shared regex editor declares its incomplete capabilities.",
            "此處不使用登入、個人用語匯入、控制器連線或憑證。來源文章保留原語言，共用正規表示式編輯器會列明未完成的功能。",
          )}
        </p>
      </aside>
    </section>
  );
}
