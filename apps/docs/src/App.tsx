import React, { useEffect, useState } from "react";
import content from "./content.generated.json";
import { Search, useSearch } from "../../web/src/Search";
import { useUI } from "./preferences";
import { Markdown, headings } from "./Markdown";
import { categories } from "./journeys";
import { Journey } from "./Journey";
import { Settings } from "./Settings";
import { Downloads } from "./Downloads";
import {Base64Page} from "./Base64Page";
import {CommandCatalog} from "./CommandCatalog";
import {useGuardedRoute} from "./useGuardedRoute";
import { Article, ArticleCards, articleURL } from "./ArticleCards";
export function App() {
  const { t, storageError } = useUI(),
    navigation = useGuardedRoute(),
    route = navigation.route,
    search = useSearch(
      content.articles,
      (article) => article.title + "\n" + article.body,
    );
  const [commands,setCommands]=useState(false);
  useEffect(()=>{const key=(event:KeyboardEvent)=>{if(event.ctrlKey&&event.shiftKey&&event.key.toLowerCase()==='f'){event.preventDefault();setCommands(true);}};addEventListener('keydown',key);return()=>removeEventListener('keydown',key);},[]);
  let article: Article | undefined,
    anchor = "";
  if (route.startsWith("#/article/")) {
    try {
      const [raw, query = ""] = route.slice(10).split("?");
      article = content.articles.find((a) => a.id === decodeURIComponent(raw));
      anchor = new URLSearchParams(query).get("anchor") || "";
    } catch {
      /* Invalid routes remain unavailable. */
    }
  }
  const categoryId = route.startsWith("#/category/") ? route.slice(11) : "",
    category = categories.find((c) => c.id === categoryId),
    searching = !!search.state.query || search.state.regex;
  useEffect(() => {
    search.setState((current) => ({ ...current, query: "", regex: false }));
    if (anchor)
      requestAnimationFrame(() =>
        document.getElementById(anchor)?.scrollIntoView(),
      );
    else window.scrollTo({ top: 0 });
  }, [route]);
  return (
    <>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        {t("Skip to content", "跳至內容")}
      </a>
      <header className="topbar">
        <a className="brand" href="#/">
          <span className="brand-symbol" aria-hidden="true">
            deployed_code
          </span>
          <span>
            Slop Machine Fleet
            <small>{t("Guides & reference", "指南及參考")}</small>
          </span>
        </a>
        <nav aria-label={t("Documentation navigation", "文件導覽")}>
          <a href="#/">{t("Learn", "學習")}</a>
          <a href="#/category/operations">{t("Guides", "指南")}</a>
          <a href="#/category/wiki">{t("Wiki", "維基")}</a>
          <a href="#/base64">{t("Base64 tools", "Base64 工具")}</a>
          <button onClick={()=>setCommands(true)} aria-label={t("Open task commands, Control Shift F","開啟工作指令，Control Shift F")}>{t("Go to a task","前往工作")}</button>
          <a href="#/settings">{t("Settings", "設定")}</a>
        </nav>
      </header>
      <div className="search-shell">
        <Search
          label={t(
            "Search every guide, article and requirement",
            "搜尋所有指南、文章及要求",
          )}
          state={search.state}
          onChange={search.setState}
          error={search.error}
        />
      </div>
      <main id="main-content" tabIndex={-1}>
        {storageError && (
          <p role="alert">
            {t(
              "Local preference storage is unavailable.",
              "無法使用本機偏好儲存。",
            )}
          </p>
        )}
        {navigation.warning}
        {route==="#/base64" ? <><Base64Page onSafety={navigation.onSafety} onLifecycle={navigation.onLifecycle}/>{searching&&<section><h2>{t('Documentation search results','文件搜尋結果')}</h2><ArticleCards articles={search.filtered}/></section>}</> : searching ? (
          <section>
            <span className="eyebrow">{t("Search results", "搜尋結果")}</span>
            <h1>
              {search.filtered.length} {t("articles found", "篇文章")}
            </h1>
            <p>
              {t(
                "Clear the search to return to your current route.",
                "清除搜尋即可返回目前頁面。",
              )}
            </p>
            <ArticleCards articles={search.filtered} />
          </section>
        ) : route === "#/settings" ? (
          <Settings />
        ) : article ? (
          <div className="reader-layout">
            <aside className="contents">
              <a href={"#/category/" + article.category}>
                {t("Back to category", "返回分類")}
              </a>
              <h2>{t("On this page", "本頁內容")}</h2>
              <nav aria-label={t("Article sections", "文章章節")}>
                {headings(article.body).map((h) => (
                  <a
                    key={h.id}
                    href={
                      articleURL(article!.id) +
                      "?anchor=" +
                      encodeURIComponent(h.id)
                    }
                  >
                    {h.title}
                  </a>
                ))}
              </nav>
            </aside>
            <article className="reader">
              <p className="eyebrow">
                {t("Complete source article", "完整來源文章")}
              </p>
              <p className="source-note">
                {t(
                  "Article language is preserved from its source; interface translations do not rewrite technical records.",
                  "文章保留來源語言，介面翻譯不會改寫技術紀錄。",
                )}
              </p>
              <Markdown body={article.body} source={article.source} />
              <details className="provenance">
                <summary>{t("Source and provenance", "來源及出處")}</summary>
                <p>
                  <a
                    href={
                      "https://github.com/Ding-Ding-Projects/slop-machine-fleet/blob/" +
                      content.commit +
                      "/" +
                      article.source
                    }
                    rel="noopener noreferrer"
                  >
                    {article.source}
                  </a>
                </p>
                <p>SHA-256: {article.sha256}</p>
              </details>
              <h2>{t("Related reading", "延伸閱讀")}</h2>
              <ArticleCards
                articles={content.articles
                  .filter(
                    (a) =>
                      a.category === article!.category && a.id !== article!.id,
                  )
                  .slice(0, 3)}
              />
            </article>
          </div>
        ) : category ? (
          <section>
            <span className="eyebrow">
              {t("Explore by task", "按工作探索")}
            </span>
            <h1>{t(category.name[0], category.name[1])}</h1>
            <p>{t(category.description[0], category.description[1])}</p>
            {content.articles.some((a) => a.category === category.id) ? (
              <ArticleCards
                articles={content.articles.filter(
                  (a) => a.category === category.id,
                )}
              />
            ) : (
              <p className="notice">
                {t(
                  "No pages in this category are bundled yet. Publication is not claimed.",
                  "此分類尚未附上任何頁面，未宣稱已發佈。",
                )}
              </p>
            )}
          </section>
        ) : route === "#/" || route === "" ? (
          <>
            <section className="intro">
              <span className="eyebrow">
                {t("Understand. Review. Operate.", "理解、審視、操作。")}
              </span>
              <h1>
                {t(
                  "Run your fleet with a clear view of every step.",
                  "每一步清楚掌握，安心管理叢集。",
                )}
              </h1>
              <p>
                {t(
                  "Practical guides for a trusted controller, deliberate provisioning and recoverable work. Start with your task, then read the complete details.",
                  "透過實用指南建立可信任控制器、審慎配置資源及保留可復原工作。由你的任務開始，再閱讀完整詳情。",
                )}
              </p>
              <div className="intro-meta">
                <span>
                  {content.articles.length}{" "}
                  {t("complete articles", "篇完整文章")}
                </span>
                <span>{t("No account required", "毋須帳戶")}</span>
                <span>{t("Local reading preferences", "本機閱讀偏好")}</span>
              </div>
            </section>
            <Journey />
            <section className="notice"><h2>{t('Transform text and files without an upload','毋須上載即可轉換文字及檔案')}</h2><p>{t('Use the local Base64 workspace to encode, decode, inspect and export your own data. Streaming and storage limits are explained before work starts.','使用本機 Base64 工作區編碼、解碼、檢查及匯出自己的資料，執行前會說明串流及儲存限制。')}</p><a href="#/base64">{t('Open Base64 tools','開啟 Base64 工具')}</a></section>
            <section className="categories">
              <header>
                <span className="eyebrow">{t("Go deeper", "深入了解")}</span>
                <h2>
                  {t(
                    "Find the guidance your next decision needs",
                    "為下一個決定尋找指引",
                  )}
                </h2>
              </header>
              <div className="article-grid">
                {categories.map((item) => (
                  <a
                    key={item.id}
                    href={"#/category/" + item.id}
                    className="article-card"
                  >
                    <h3>{t(item.name[0], item.name[1])}</h3>
                    <p>{t(item.description[0], item.description[1])}</p>
                    <span>
                      {
                        content.articles.filter((a) => a.category === item.id)
                          .length
                      }{" "}
                      {t("articles", "篇文章")}
                    </span>
                  </a>
                ))}
              </div>
            </section>
            <Downloads />
          </>
        ) : (
          <section>
            <h1>{t("Page unavailable", "頁面不可用")}</h1>
            <p>
              {t(
                "This route is not part of the bundled documentation.",
                "此路徑不屬於已附文件。",
              )}
            </p>
            <a href="#/">{t("Return to guided reading", "返回導讀")}</a>
          </section>
        )}
      </main>
      {navigation.confirmation}
      {commands&&<CommandCatalog onClose={()=>setCommands(false)} navigate={navigation.navigate}/>}
      <footer>
        <p>
          Slop Machine Fleet ·{" "}
          {t(
            "Documentation companion, not the installed application.",
            "文件伴隨介面，並非已安裝應用程式。",
          )}
        </p>
        <p>
          {t("Documentation build", "文件建置版本")} v{content.version} · {t("Documentation source", "文件來源")}:{" "}
          <code>{content.commit.slice(0, 12)}</code> · {t("Documentation built", "文件建置時間")}:{" "}
          {content.generatedAt}
        </p>
        <p>
          {t(
            "Full required-feature acceptance, complete settings and regex parity remain unfinished.",
            "完整所需功能驗證、完整設定及正規表示式功能對等仍未完成。",
          )}
        </p>
      </footer>
    </>
  );
}
