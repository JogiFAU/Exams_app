import test from "node:test";
import assert from "node:assert/strict";
import { renderAiMarkdown } from "../src/ui/markdown.js";

test("renders headings, emphasis and lists from AI annotations", () => {
  const html = renderAiMarkdown("### Einordnung\n\n**Wichtig** und *klinisch*:\n- Punkt A\n- Punkt B");
  assert.equal(html, "<h5>Einordnung</h5><p><strong>Wichtig</strong> und <em>klinisch</em>:</p><ul><li>Punkt A</li><li>Punkt B</li></ul>");
});

test("escapes dataset HTML before applying Markdown", () => {
  const html = renderAiMarkdown("<img src=x onerror=alert(1)> **sicher**");
  assert.equal(html, "<p>&lt;img src=x onerror=alert(1)&gt; <strong>sicher</strong></p>");
  assert.ok(!html.includes("<img"));
});

test("supports numbered lists, quotes, inline code and Windows line endings", () => {
  const html = renderAiMarkdown("1. Eins\r\n2) Zwei\r\n\r\n> Merksatz mit `Code`");
  assert.equal(html, "<ol><li>Eins</li><li>Zwei</li></ol><blockquote>Merksatz mit <code>Code</code></blockquote>");
});

test("treats single line breaks as flowing text instead of forced visual breaks", () => {
  const html = renderAiMarkdown("Das ist\n**besonders wichtig**\nfür die Einordnung.");
  assert.equal(html, "<p>Das ist <strong>besonders wichtig</strong> für die Einordnung.</p>");
  assert.ok(!html.includes("<br>"));
});
