export function normalizePath(source, href) {
  if (!href || /[\u0000-\u0020]/.test(href)) return null;
  let decoded;
  try {
    decoded = decodeURIComponent(href);
  } catch {
    return null;
  }
  if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(decoded)) return null;
  const [pathname, anchor = ""] = decoded.split("#");
  const parts = pathname.startsWith("/") ? [] : source.split("/").slice(0, -1);
  for (const segment of pathname.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(segment);
  }
  return { path: pathname ? parts.join("/") : source, anchor };
}
export function articleHref(source, href, ids) {
  const resolved = normalizePath(source, href);
  if (!resolved) return null;
  const id = resolved.path.replace(/\.md$/i, "");
  if (!ids.has(id)) return null;
  return (
    "#/article/" +
    encodeURIComponent(id) +
    (resolved.anchor ? "?anchor=" + encodeURIComponent(resolved.anchor) : "")
  );
}
export function externalHref(href) {
  try {
    const url = new URL(href);
    if (url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}
export function headingId(text, seen) {
  const base =
    text
      .toLowerCase()
      .replace(/<[^>]*>/g, "")
      .replace(/[^\p{L}\p{N}_ -]/gu, "")
      .trim()
      .replace(/\s/g, "-") || "section";
  const count = seen.get(base) || 0;
  seen.set(base, count + 1);
  return count ? base + "-" + count : base;
}
