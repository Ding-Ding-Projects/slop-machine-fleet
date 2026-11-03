import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
const here = path.dirname(fileURLToPath(import.meta.url)),
  root = path.resolve(here, "../../.."),
  app = path.resolve(here, "..");
const digest = (bytes) =>
  crypto.createHash("sha256").update(bytes).digest("hex");
export function articleId(source) {
  return source.replace(/\.md$/i, "").replaceAll("\\", "/");
}
export function validRelease(value) {
  return (
    !!value &&
    value.verified === true &&
    value.isDraft === false &&
    value.isPrerelease === false &&
    typeof value.tag === "string" &&
    /^[A-Za-z0-9._-]{1,100}$/.test(value.tag) &&
    typeof value.sourceCommit === "string" &&
    /^[a-f0-9]{40}$/.test(value.sourceCommit) &&
    Array.isArray(value.assets) &&
    value.assets.length > 0 &&
    value.assets.every(
      (a) =>
        typeof a.name === "string" &&
        a.name.length < 200 &&
        Number.isSafeInteger(a.size) &&
        a.size > 0 &&
        typeof a.sha256 === "string" &&
        /^[a-f0-9]{64}$/.test(a.sha256) &&
        typeof a.url === "string" &&
        a.url.startsWith(
          "https://github.com/Ding-Ding-Projects/slop-machine-fleet/releases/download/" +
            encodeURIComponent(value.tag) +
            "/",
        ) &&
        !/[\s<>]/.test(a.url),
    )
  );
}
async function walk(dir) {
  const result = [];
  for (const entry of (await fs.readdir(dir, { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name),
  )) {
    if (entry.isSymbolicLink())
      throw Error("Documentation symlinks are not supported");
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(p)));
    else if (entry.name.toLowerCase().endsWith(".md")) result.push(p);
  }
  return result;
}
export async function prepare() {
  const generated = path.join(app, "public/generated");
  await fs.mkdir(generated, { recursive: true });
  const files = [
    ...(await fs.readdir(root))
      .filter(
        (name) =>
          name.toLowerCase().endsWith(".md") &&
          ![
            "AGENTS.md",
            "CLAUDE.md",
            "CLOSEOUT_PROMPT.md",
            "HANDOFF.md",
          ].includes(name),
      )
      .map((name) => path.join(root, name)),
    ...(await walk(path.join(root, "docs"))),
  ];
  for (const dir of ["deploy", "apps/desktop", "apps/web", "worker"]) {
    const entry = path.join(root, dir, "README.md");
    if (
      await fs
        .stat(entry)
        .then((s) => s.isFile())
        .catch(() => false)
    )
      files.push(entry);
  }
  const articles = [],
    assets = {};
  for (const file of files) {
    const stat = await fs.stat(file);
    if (stat.size > 4 * 1024 * 1024)
      throw Error("Documentation article exceeds 4 MiB");
    const bytes = await fs.readFile(file),
      source = path.relative(root, file).replaceAll("\\", "/"),
      body = bytes.toString("utf8");
    const title =
      /^#\s+(.+)$/m.exec(body)?.[1] ||
      path.basename(file, ".md").replaceAll("-", " ");
    const category = source.includes("/wiki/")
      ? "wiki"
      : source.includes("/requirements/")
        ? "requirements"
        : source.includes("/fleet/")
          ? "operations"
          : source.includes("/tools/")
            ? "tools"
            : "reference";
    articles.push({
      id: articleId(source),
      source,
      title,
      category,
      body,
      sha256: digest(bytes),
    });
    const imageLinks = [];
    marked.walkTokens(marked.lexer(body, { gfm: true }), (token) => {
      if (token.type === "image") imageLinks.push(token.href);
    });
    for (const imageLink of imageLinks) {
      let href;
      try {
        href = decodeURIComponent(imageLink);
      } catch {
        continue;
      }
      if (/^[a-z]+:|^\/\/|^#/i.test(href)) continue;
      const candidate = path.resolve(path.dirname(file), href.split("#")[0]);
      if (
        !candidate.startsWith(root + path.sep) ||
        !/^\.(png|jpe?g|webp|gif)$/i.test(path.extname(candidate))
      )
        continue;
      const real = await fs.realpath(candidate).catch(() => null);
      if (!real || !real.startsWith(root + path.sep)) continue;
      const image = await fs.readFile(real);
      if (image.length > 16 * 1024 * 1024)
        throw Error("Documentation image exceeds 16 MiB");
      const name = digest(image) + path.extname(real).toLowerCase();
      await fs.writeFile(path.join(generated, name), image);
      assets[path.relative(root, candidate).replaceAll("\\", "/")] =
        "generated/" + name;
    }
  }
  // The original design remains a pinned source reference, not a new tracked copy.
  const reference = "3aa1ca8";
  let tokens = execFileSync(
    "git",
    ["show", reference + ":design/design-system/tokens.css"],
    { cwd: root, encoding: "utf8" },
  );
  const fontPaths = execFileSync(
    "git",
    ["ls-tree", "-r", "--name-only", reference, "design/design-system"],
    { cwd: root, encoding: "utf8" },
  )
    .split(/\r?\n/)
    .filter(
      (p) =>
        p.endsWith(".woff2") || (p.includes("/LICENSE") && p.endsWith(".txt")),
    );
  await fs.mkdir(path.join(generated, "fonts"), { recursive: true });
  for (const font of fontPaths) {
    const bytes = execFileSync("git", ["show", reference + ":" + font], {
      cwd: root,
      maxBuffer: 20 * 1024 * 1024,
    });
    await fs.writeFile(
      path.join(generated, "fonts", path.basename(font)),
      bytes,
    );
  }
  await fs.writeFile(path.join(generated, "tokens.css"), tokens);
  let release = null;
  try {
    const candidate = JSON.parse(
      await fs.readFile(path.join(app, "release.json"), "utf8"),
    );
    if (!validRelease(candidate))
      throw Error("Release configuration lacks validated publication evidence");
    release = candidate;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const commit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const content = {
    schemaVersion: 1,
    version: JSON.parse(
      await fs.readFile(path.join(app, "package.json"), "utf8"),
    ).version,
    commit,
    generatedAt: new Date().toISOString(),
    designReference: reference,
    articles,
    assets,
    release,
  };
  await fs.writeFile(
    path.join(app, "src/content.generated.json"),
    JSON.stringify(content),
  );
  console.log(
    `Documentation inventory: ${articles.length} complete articles, ${Object.keys(assets).length} local image references, ${fontPaths.length} font and licence files. Release: ${release ? "configured" : "unavailable"}.`,
  );
  return content;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await prepare();
