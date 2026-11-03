import React, { createContext, useContext, useEffect, useState } from "react";
type Settings = {
  language: "en" | "yue" | "both";
  theme: "light" | "dark" | "system";
  reduceMotion: boolean;
};
const defaults: Settings = {
    language: "en",
    theme: "system",
    reduceMotion: false,
  },
  key = "fleet.docs.preferences.v1";
function read(): Settings {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "{}");
    return {
      language: ["en", "yue", "both"].includes(value.language)
        ? value.language
        : "en",
      theme: ["light", "dark", "system"].includes(value.theme)
        ? value.theme
        : "system",
      reduceMotion: value.reduceMotion === true,
    };
  } catch {
    return defaults;
  }
}
const Context = createContext<{
  prefs: Settings;
  set: (change: Partial<Settings>) => void;
  t: (en: string, yue?: string) => string;
  storageError: boolean;
}>(null!);
export const useUI = () => useContext(Context);
export function UIProvider({ children }: { children: React.ReactNode }) {
  const [prefs, update] = useState(read),
    [storageError, setStorageError] = useState(false);
  const set = (change: Partial<Settings>) =>
    update((current) => {
      const next = { ...current, ...change };
      try {
        localStorage.setItem(key, JSON.stringify(next));
        setStorageError(false);
      } catch {
        setStorageError(true);
      }
      return next;
    });
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme =
        prefs.theme === "system"
          ? media.matches
            ? "dark"
            : "light"
          : prefs.theme;
      document.documentElement.dataset.motion = prefs.reduceMotion
        ? "reduced"
        : "normal";
      document.documentElement.lang = prefs.language === "yue" ? "zh-HK" : "en";
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [prefs]);
  const t = (en: string, yue = en) =>
    prefs.language === "en"
      ? en
      : prefs.language === "yue"
        ? yue
        : en === yue
          ? en
          : `${en} · ${yue}`;
  return (
    <Context.Provider value={{ prefs, set, t, storageError }}>
      {children}
    </Context.Provider>
  );
}
