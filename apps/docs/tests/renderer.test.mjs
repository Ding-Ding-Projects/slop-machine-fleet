import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const compiled = await build({
  stdin: {
    contents: `import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {Markdown} from './src/Markdown.tsx';export const render=(body)=>renderToStaticMarkup(React.createElement(Markdown,{body,source:'docs/API.md'}));`,
    resolveDir: root,
    loader: "tsx",
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  define: { "import.meta.env.BASE_URL": '"/slop-machine-fleet/"' },
  logLevel: "silent",
});
const module = { exports: {} };
new Function("require", "module", "exports", compiled.outputFiles[0].text)(
  createRequire(import.meta.url),
  module,
  module.exports,
);
const { render } = module.exports;
test("real Markdown renderer preserves tables, code, headings and list content", () => {
  const html = render(
    "# Heading\n\n| A | B |\n|---|---|\n| one | two |\n\n```js\nconst x = 1;\n```\n\n- item",
  );
  for (const expected of [
    'id="heading"',
    "<table>",
    '<th scope="col">A',
    "<td>two",
    "const x = 1;",
    "<li>",
  ])
    assert.ok(html.includes(expected), expected);
});
test("real renderer never executes HTML, unsafe links or remote embedded images", () => {
  const html = render(
    "<script>alert(1)</script>\n\n[x](javascript:alert(1))\n\n![remote](https://example.com/image.png)",
  );
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes('href="javascript:'));
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("&lt;script&gt;"));
});
