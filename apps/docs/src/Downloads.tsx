import React from "react";
import content from "./content.generated.json";
import { useUI } from "./preferences";
export function Downloads() {
  const { t } = useUI();
  const release = content.release as null | {
    tag: string;
    sourceCommit: string;
    assets: { name: string; url: string; size: number; sha256: string }[];
  };
  return (
    <section className="downloads">
      <div>
        <span className="eyebrow">
          {t("Verified delivery only", "只提供經驗證交付")}
        </span>
        <h2>
          {t(
            "Take the next step in the installed application",
            "在已安裝應用程式繼續下一步",
          )}
        </h2>
        <p>
          {t(
            "This companion explains workflows. It never hosts the controller or creates paid infrastructure.",
            "此伴隨介面只解說工作流程，不會提供控制器或建立收費基礎設施。",
          )}
        </p>
      </div>
      {release ? (
        <div>
          <p>
            {t("Release", "版本")} {release.tag}
          </p>
          {release.assets.map((asset) => (
            <p key={asset.url}>
              <a href={asset.url} rel="noopener noreferrer">
                {asset.name}
              </a>{" "}
              · {asset.size.toLocaleString()} bytes
              <br />
              <small>SHA-256: {asset.sha256}</small>
            </p>
          ))}
        </div>
      ) : (
        <p className="notice">
          {t(
            "Downloads unavailable: no verified release manifest is bundled. No placeholder installer is offered.",
            "下載不可用：尚未附上經驗證的版本清單，不會提供佔位安裝程式。",
          )}
        </p>
      )}
    </section>
  );
}
