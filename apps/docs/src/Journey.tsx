import React, { useState } from "react";
import { useUI } from "./preferences";
import { journeys } from "./journeys";
import content from "./content.generated.json";
import { articleURL } from "./ArticleCards";
export function Journey() {
  const { t } = useUI();
  const [chosen, setChosen] = useState(0),
    [step, setStep] = useState(0),
    [storageError, setStorageError] = useState(false),
    [done, setDone] = useState<string[]>(() => {
      try {
        const value = JSON.parse(
          localStorage.getItem("fleet.docs.progress.v1") || "[]",
        );
        return Array.isArray(value)
          ? value
              .filter(
                (x): x is string =>
                  typeof x === "string" &&
                  /^(setup|provision|recover)-[0-2]$/.test(x),
              )
              .slice(0, 9)
          : [];
      } catch {
        return [];
      }
    });
  const journey = journeys[chosen],
    current = journey.steps[step],
    id = journey.id + "-" + step;
  const change = (checked: boolean) =>
    setDone((previous) => {
      const next = checked
        ? [...new Set([...previous, id])]
        : previous.filter((x) => x !== id);
      try {
        localStorage.setItem("fleet.docs.progress.v1", JSON.stringify(next));
        setStorageError(false);
      } catch {
        setStorageError(true);
      }
      return next;
    });
  return (
    <section className="journey" aria-labelledby="journey-title">
      <header>
        <span className="eyebrow">
          {t("Start with a real task", "由實際工作開始")}
        </span>
        <h2 id="journey-title">
          {t("A clear next step, at your pace", "按你的步伐，掌握下一步")}
        </h2>
        <p>
          {t(
            "This checklist tracks your reading on this browser only. It does not run or verify the installed application.",
            "此清單只記錄本瀏覽器的閱讀進度，不會執行或驗證已安裝的應用程式。",
          )}
        </p>
      </header>
      <div className="journey-layout">
        <nav aria-label={t("Choose a guided task", "選擇導讀工作")}>
          {journeys.map((item, index) => (
            <button
              key={item.id}
              aria-pressed={chosen === index}
              onClick={() => {
                setChosen(index);
                setStep(0);
              }}
            >
              <span className="step-number">0{index + 1}</span>
              <span>
                {t(item.title[0], item.title[1])}
                <small>{t(item.intro[0], item.intro[1])}</small>
              </span>
            </button>
          ))}
        </nav>
        <div className="journey-step">
          <p className="eyebrow">
            {t("Step", "步驟")} {step + 1} / {journey.steps.length}
          </p>
          <h3>{t(current.title[0], current.title[1])}</h3>
          <p>{t(current.body[0], current.body[1])}</p>
          {content.articles.some((a) => a.id === current.article) ? (
            <a className="primary-link" href={articleURL(current.article)}>
              {t("Read the complete guide", "閱讀完整指南")}
            </a>
          ) : (
            <p>{t("This guide is not yet bundled.", "尚未附上此指南。")}</p>
          )}
          <label className="check">
            <input
              type="checkbox"
              checked={done.includes(id)}
              onChange={(e) => change(e.target.checked)}
            />
            {t("Mark this reading step complete", "將此閱讀步驟標為完成")}
          </label>
          <div className="actions">
            <button disabled={step === 0} onClick={() => setStep(step - 1)}>
              {t("Back", "上一步")}
            </button>
            <button
              disabled={step === journey.steps.length - 1}
              onClick={() => setStep(step + 1)}
            >
              {t("Next step", "下一步")}
            </button>
            <span role="status">
              {done.length}/9 {t("reading steps checked", "個閱讀步驟已標記")}
            </span>
          </div>
          {storageError && (
            <p role="alert">
              {t(
                "Progress could not be saved. Restart recovery is unavailable.",
                "未能儲存進度，重新開啟後無法復原。",
              )}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
