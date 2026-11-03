import React from "react";
import content from "./content.generated.json";
import { useUI } from "./preferences";
export type Article = (typeof content.articles)[number];
export const articleURL = (id: string) => "#/article/" + encodeURIComponent(id);
export function ArticleCards({ articles }: { articles: Article[] }) {
  const { t } = useUI();
  return (
    <div className="article-grid">
      {articles.map((article) => (
        <a
          className="article-card"
          key={article.id}
          href={articleURL(article.id)}
        >
          <span className="eyebrow">{t("Complete article", "完整文章")}</span>
          <h3>{article.title}</h3>
          <p>
            {article.body
              .split(/\n\s*\n/)
              .find((p) => !p.startsWith("#") && !p.startsWith("<!--"))
              ?.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
              .slice(0, 180) ||
              t(
                "Read the full guide and its verification boundaries.",
                "閱讀完整指南及驗證界線。",
              )}
          </p>
          <span>
            {t("Read guide", "閱讀指南")} <span aria-hidden="true">↗</span>
          </span>
        </a>
      ))}
    </div>
  );
}
