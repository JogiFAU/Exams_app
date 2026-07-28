import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("keeps Markdown emphasis inline inside answer explanation tooltips", async () => {
  const css = await readFile(new URL("../assets/styles.css", import.meta.url), "utf8");

  assert.match(css, /\.optExplainTooltip__title\s*\{\s*display:\s*block;\s*\}/);
  assert.match(css, /\.optExplainTooltip__body strong\s*\{\s*display:\s*inline;\s*\}/);
  assert.doesNotMatch(css, /\.optExplainTooltip strong\s*\{/);
});
