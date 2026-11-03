import React from "react";
import { marked, Token, Tokens } from "marked";
import content from "./content.generated.json";
import {
  articleHref,
  externalHref,
  headingId,
  normalizePath,
} from "./links.mjs";
const ids = new Set(content.articles.map((a) => a.id));
export function Markdown({ body, source }: { body: string; source: string }) {
  const seen = new Map<string, number>();
  function link(href: string) {
    return articleHref(source, href, ids) || externalHref(href);
  }
  function render(tokens: Token[], inline = false): React.ReactNode {
    return tokens.map((token, index) => {
      const key = index;
      switch (token.type) {
        case "space":
          return null;
        case "heading": {
          const item = token as Tokens.Heading;
          const Tag = ("h" + item.depth) as "h1";
          return (
            <Tag key={key} id={headingId(item.text, seen)}>
              {render(item.tokens, true)}
            </Tag>
          );
        }
        case "paragraph":
          return (
            <p key={key}>{render((token as Tokens.Paragraph).tokens, true)}</p>
          );
        case "text": {
          const item = token as Tokens.Text;
          return (
            <React.Fragment key={key}>
              {item.tokens ? render(item.tokens, inline) : item.text}
            </React.Fragment>
          );
        }
        case "escape":
          return (
            <React.Fragment key={key}>
              {(token as Tokens.Escape).text}
            </React.Fragment>
          );
        case "strong":
          return (
            <strong key={key}>
              {render((token as Tokens.Strong).tokens, true)}
            </strong>
          );
        case "em":
          return <em key={key}>{render((token as Tokens.Em).tokens, true)}</em>;
        case "del":
          return (
            <del key={key}>{render((token as Tokens.Del).tokens, true)}</del>
          );
        case "codespan":
          return <code key={key}>{(token as Tokens.Codespan).text}</code>;
        case "code":
          return (
            <pre key={key}>
              <code>{(token as Tokens.Code).text}</code>
            </pre>
          );
        case "br":
          return <br key={key} />;
        case "hr":
          return <hr key={key} />;
        case "blockquote":
          return (
            <blockquote key={key}>
              {render((token as Tokens.Blockquote).tokens)}
            </blockquote>
          );
        case "list": {
          const item = token as Tokens.List;
          const children = item.items.map((entry, i) => (
            <li key={i}>
              {entry.task && (
                <input
                  type="checkbox"
                  checked={!!entry.checked}
                  readOnly
                  aria-label={
                    entry.checked
                      ? "Completed in source"
                      : "Incomplete in source"
                  }
                />
              )}{" "}
              {render(entry.tokens)}
            </li>
          ));
          return item.ordered ? (
            <ol
              key={key}
              start={typeof item.start === "number" ? item.start : 1}
            >
              {children}
            </ol>
          ) : (
            <ul key={key}>{children}</ul>
          );
        }
        case "link": {
          const item = token as Tokens.Link,
            url = link(item.href);
          return url ? (
            <a
              key={key}
              href={url}
              rel={url.startsWith("https:") ? "noopener noreferrer" : undefined}
            >
              {render(item.tokens, true)}
            </a>
          ) : (
            <span key={key}>
              {render(item.tokens, true)} <small>(link unavailable)</small>
            </span>
          );
        }
        case "image": {
          const item = token as Tokens.Image,
            resolved = normalizePath(source, item.href),
            asset = resolved
              ? (content.assets as Record<string, string>)[resolved.path]
              : null;
          return asset ? (
            <img
              key={key}
              src={import.meta.env.BASE_URL + asset}
              alt={item.text}
              loading="lazy"
            />
          ) : (
            <span key={key}>[Image unavailable: {item.text}]</span>
          );
        }
        case "table": {
          const item = token as Tokens.Table;
          return (
            <div
              className="table-scroll"
              key={key}
              tabIndex={0}
              role="region"
              aria-label="Article table"
            >
              <table>
                <thead>
                  <tr>
                    {item.header.map((cell, i) => (
                      <th key={i} scope="col">
                        {render(cell.tokens, true)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {item.rows.map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td key={j}>{render(cell.tokens, true)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        case "html":
          return (
            <pre key={key} className="raw-html">
              {token.raw}
            </pre>
          );
        case "def":
          return null;
        default:
          return <React.Fragment key={key}>{token.raw}</React.Fragment>;
      }
    });
  }
  return (
    <div className="markdown">{render(marked.lexer(body, { gfm: true }))}</div>
  );
}
export function headings(body: string) {
  const seen = new Map<string, number>();
  return marked
    .lexer(body, { gfm: true })
    .filter((token): token is Tokens.Heading => token.type === "heading")
    .map((h) => ({
      title: h.text,
      id: headingId(h.text, seen),
      depth: h.depth,
    }));
}
