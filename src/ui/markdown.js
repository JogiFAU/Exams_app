function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function renderInlineMarkdown(value) {
  let text = escapeHtml(value);
  const code = [];
  text = text.replace(/`([^`\n]+)`/g, (_, content) => {
    const token = `\u0000CODE${code.length}\u0000`;
    code.push(`<code>${content}</code>`);
    return token;
  });
  text = text
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s).,;:!?])/g, "$1<em>$2</em>")
    .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,;:!?])/g, "$1<em>$2</em>");
  return text.replace(/\u0000CODE(\d+)\u0000/g, (_, index) => code[Number(index)] || "");
}

/** Render the safe Markdown subset used by AI annotations. */
export function renderAiMarkdown(value) {
  const lines = String(value ?? "").replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  const output = [];
  let paragraph = [];
  let listType = null;
  const closeParagraph = () => {
    if (!paragraph.length) return;
    output.push(`<p>${paragraph.map(renderInlineMarkdown).join("<br>")}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (!listType) return;
    output.push(`</${listType}>`);
    listType = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) { closeParagraph(); closeList(); continue; }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      closeParagraph(); closeList();
      const level = heading[1].length + 2;
      output.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }
    const listItem = line.match(/^([-*+] |\d+[.)] )(.*)$/);
    if (listItem) {
      closeParagraph();
      const nextListType = /^\d/.test(listItem[1]) ? "ol" : "ul";
      if (listType !== nextListType) { closeList(); output.push(`<${nextListType}>`); listType = nextListType; }
      output.push(`<li>${renderInlineMarkdown(listItem[2])}</li>`);
      continue;
    }
    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      closeParagraph(); closeList();
      output.push(`<blockquote>${renderInlineMarkdown(quote[1])}</blockquote>`);
      continue;
    }
    closeList();
    paragraph.push(line);
  }
  closeParagraph(); closeList();
  return output.join("");
}
