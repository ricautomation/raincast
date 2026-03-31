/**
 * Lightweight HTML → Markdown converter.
 *
 * Walks a cheerio-parsed tree and emits Markdown. Covers the elements that
 * matter for documentation / article pages: headings, paragraphs, lists,
 * links, emphasis, code, tables, blockquotes, images, and horizontal rules.
 *
 * This deliberately avoids external deps (no turndown) so the package stays
 * tiny and we control every edge-case.
 */

import type { CheerioAPI, Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";

export function htmlToMarkdown($: CheerioAPI, root?: Cheerio<AnyNode>): string {
  const el = root ?? $.root();
  const lines: string[] = [];

  function walk(node: AnyNode, listDepth = 0): string {
    if (node.type === "text") {
      // Collapse whitespace runs into single spaces (browser-like behavior)
      return (node as unknown as { data: string }).data.replace(/[ \t\r\n]+/g, " ");
    }

    // Root/document nodes: walk children
    if (node.type === "root" || node.type !== "tag") {
      if (node.type === "root") {
        return $(node).contents().toArray().map((c) => walk(c, listDepth)).join("");
      }
      return "";
    }

    const $n = $(node);
    const tag = (node as unknown as { tagName: string }).tagName?.toLowerCase();

    // Skip hidden/non-content elements
    if (["script", "style", "noscript", "svg", "canvas", "template", "iframe"].includes(tag)) {
      return "";
    }

    const children = (): string =>
      $n.contents().toArray().map((c) => walk(c, listDepth)).join("");

    switch (tag) {
      // ── Headings ──
      case "h1": return `\n\n# ${children().trim()}\n\n`;
      case "h2": return `\n\n## ${children().trim()}\n\n`;
      case "h3": return `\n\n### ${children().trim()}\n\n`;
      case "h4": return `\n\n#### ${children().trim()}\n\n`;
      case "h5": return `\n\n##### ${children().trim()}\n\n`;
      case "h6": return `\n\n###### ${children().trim()}\n\n`;

      // ── Block elements ──
      case "p":
      case "div":
      case "section":
      case "article":
      case "main":
      case "figure": {
        const text = children().trim();
        return text ? `\n\n${text}\n\n` : "";
      }

      case "br": return "\n";
      case "hr": return "\n\n---\n\n";

      // ── Lists ──
      case "ul":
      case "ol": {
        const items = $n.children("li").toArray();
        const prefix = tag === "ol" ? (i: number) => `${"  ".repeat(listDepth)}${i + 1}. ` : () => `${"  ".repeat(listDepth)}- `;
        return "\n" + items.map((li, i) => {
          const content = $(li).contents().toArray().map((c) => walk(c, listDepth + 1)).join("").trim();
          return prefix(i) + content;
        }).join("\n") + "\n";
      }

      case "li": {
        return children().trim();
      }

      // ── Inline formatting ──
      case "strong":
      case "b": {
        const t = children().trim();
        return t ? `**${t}**` : "";
      }
      case "em":
      case "i": {
        const t = children().trim();
        return t ? `*${t}*` : "";
      }
      case "code": {
        const t = children().trim();
        return t ? `\`${t}\`` : "";
      }
      case "del":
      case "s": {
        const t = children().trim();
        return t ? `~~${t}~~` : "";
      }

      // ── Links ──
      case "a": {
        const href = $n.attr("href") ?? "";
        const text = children().trim();
        if (!text) return "";
        if (!href || href.startsWith("#") || href.startsWith("javascript:")) return text;
        return `[${text}](${href})`;
      }

      // ── Images ──
      case "img": {
        const alt = $n.attr("alt") ?? "";
        const src = $n.attr("src") ?? "";
        if (!src) return alt;
        return `![${alt}](${src})`;
      }

      // ── Code blocks ──
      case "pre": {
        const code = $n.find("code").first();
        const lang = (code.attr("class") ?? "").replace(/^language-/, "").split(/\s/)[0] || "";
        const raw = code.length ? code.text() : $n.text();
        return `\n\n\`\`\`${lang}\n${raw.trim()}\n\`\`\`\n\n`;
      }

      // ── Blockquotes ──
      case "blockquote": {
        const inner = children().trim();
        return "\n\n" + inner.split("\n").map((l) => `> ${l}`).join("\n") + "\n\n";
      }

      // ── Tables ──
      case "table": {
        return convertTable($, $n);
      }

      // ── Details/summary ──
      case "details": {
        const summary = $n.children("summary").text().trim();
        const body = children().trim();
        return `\n\n**${summary || "Details"}**\n\n${body}\n\n`;
      }

      case "figcaption": {
        const t = children().trim();
        return t ? `\n*${t}*\n` : "";
      }

      default:
        return children();
    }
  }

  lines.push(walk(el.get(0)!));

  // Clean up: collapse 3+ newlines into 2, trim
  return lines
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\s+|\s+$/g, "")
    .trim();
}

/** Convert an HTML table to a Markdown table. */
function convertTable($: CheerioAPI, $table: Cheerio<AnyNode>): string {
  const rows: string[][] = [];

  $table.find("tr").each((_, tr) => {
    const cells: string[] = [];
    $(tr).children("th, td").each((_, cell) => {
      cells.push($(cell).text().trim().replace(/\|/g, "\\|"));
    });
    if (cells.length > 0) rows.push(cells);
  });

  if (rows.length === 0) return "";

  // Normalize column count
  const cols = Math.max(...rows.map((r) => r.length));
  for (const row of rows) {
    while (row.length < cols) row.push("");
  }

  const header = rows[0];
  const separator = header.map(() => "---");
  const body = rows.slice(1);

  const format = (r: string[]) => `| ${r.join(" | ")} |`;
  const lines = [format(header), format(separator), ...body.map(format)];
  return "\n\n" + lines.join("\n") + "\n\n";
}
