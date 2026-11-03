import test from "node:test";
import assert from "node:assert/strict";
import {
  articleHref,
  externalHref,
  normalizePath,
  headingId,
} from "../src/links.mjs";
import { validRelease } from "../scripts/prepare.mjs";
test("relative articles and anchors resolve within the bundle", () => {
  const ids = new Set(["docs/features/setup", "docs/features/auth"]);
  assert.equal(
    articleHref("docs/features/setup.md", "auth.md#sign-in", ids),
    "#/article/docs%2Ffeatures%2Fauth?anchor=sign-in",
  );
  assert.equal(
    articleHref("docs/features/setup.md", "#here", ids),
    "#/article/docs%2Ffeatures%2Fsetup?anchor=here",
  );
  assert.equal(articleHref("docs/features/setup.md", "missing.md", ids), null);
});
test("unsafe protocols and traversal do not become active content", () => {
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,test",
    "//example.com/x",
    "%6aavascript:alert(1)",
    "../../../outside.png",
  ])
    assert.equal(normalizePath("docs/a.md", url), null);
  for (const url of [
    "javascript:alert(1)",
    "http://example.com",
    "https://user:pass@example.com",
  ])
    assert.equal(externalHref(url), null);
});
test("headings retain unicode and stable duplicate anchors", () => {
  const seen = new Map();
  assert.equal(headingId("安全設定", seen), "安全設定");
  assert.equal(headingId("A heading", seen), "a-heading");
  assert.equal(headingId("A heading", seen), "a-heading-1");
});
test("downloads require exact publication and asset evidence", () => {
  const release = {
    verified: true,
    isDraft: false,
    isPrerelease: false,
    tag: "v1.0.0",
    sourceCommit: "a".repeat(40),
    assets: [
      {
        name: "setup.exe",
        size: 123,
        sha256: "b".repeat(64),
        url: "https://github.com/Ding-Ding-Projects/slop-machine-fleet/releases/download/v1.0.0/setup.exe",
      },
    ],
  };
  assert.equal(validRelease(release), true);
  for (const change of [
    { verified: false },
    { isDraft: true },
    { isPrerelease: true },
    { assets: [] },
    { sourceCommit: "main" },
  ])
    assert.equal(validRelease({ ...release, ...change }), false);
  assert.equal(
    validRelease({
      ...release,
      assets: [{ ...release.assets[0], url: "https://evil.example/setup.exe" }],
    }),
    false,
  );
});
