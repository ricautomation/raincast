/**
 * Readability-inspired content extraction.
 *
 * Like Firecrawl's approach: strip boilerplate, score candidate elements by
 * text density, pick the highest-scoring container as "main content".
 *
 * 1. Remove known non-content elements (nav, footer, ads, scripts)
 * 2. Score remaining containers by text density + structural hints
 * 3. Return the winning element's inner HTML
 */

import type { CheerioAPI, Cheerio } from "cheerio";
import type { Element } from "domhandler";

/** Elements to always strip — never contain article content. */
const STRIP_TAGS = [
  "script", "style", "noscript", "svg", "canvas", "template",
  "iframe", "object", "embed", "applet", "form",
];

/** Selectors for non-content blocks (nav, sidebars, footers, ads). */
const STRIP_SELECTORS = [
  "nav", "footer", "header:not(article header)",
  "[role='navigation']", "[role='banner']", "[role='contentinfo']",
  "[role='complementary']", "[aria-hidden='true']",
  ".sidebar", ".nav", ".menu", ".footer", ".header",
  ".advertisement", ".ad", ".ads", ".advert",
  ".social-share", ".share-buttons", ".related-posts",
  ".comments", ".comment-section", "#comments",
  ".cookie-banner", ".cookie-consent", ".popup", ".modal",
  ".newsletter", ".subscribe", ".signup",
  ".breadcrumb", ".pagination",
];

/** Class/id patterns that suggest a content container. */
const POSITIVE_PATTERNS = /article|content|body|main|post|entry|text|blog|story|page|hentry/i;

/** Class/id patterns that suggest non-content. */
const NEGATIVE_PATTERNS = /sidebar|widget|comment|footer|header|nav|menu|ad|social|share|related|promo|sponsor|banner|cookie|popup|modal/i;

export function extractContent($: CheerioAPI): string {
  // Step 1: Strip known non-content elements
  for (const tag of STRIP_TAGS) {
    $(tag).remove();
  }
  for (const selector of STRIP_SELECTORS) {
    try {
      $(selector).remove();
    } catch {
      // Invalid selector in some edge cases — skip
    }
  }

  // Step 2: Check for semantic main content container
  const semantic = $("article, [role='main'], main").first();
  if (semantic.length && semantic.text().trim().length > 200) {
    return semantic.html() ?? "";
  }

  // Step 3: Score candidate containers
  const candidates: Array<{ el: Cheerio<Element>; score: number }> = [];

  $("div, section, td, article").each((_, el) => {
    const $el = $(el);
    const text = $el.text().trim();
    const textLen = text.length;

    // Skip elements with very little text
    if (textLen < 100) return;

    const html = $el.html() ?? "";
    const htmlLen = html.length || 1;

    // Text density: ratio of text to HTML (higher = more content, less markup)
    const density = textLen / htmlLen;

    // Paragraph count bonus
    const pCount = $el.find("p").length;

    // Class/id scoring
    const classId = `${$el.attr("class") ?? ""} ${$el.attr("id") ?? ""}`;
    let classScore = 0;
    if (POSITIVE_PATTERNS.test(classId)) classScore += 25;
    if (NEGATIVE_PATTERNS.test(classId)) classScore -= 25;

    // Link density penalty (too many links = probably nav)
    const linkTextLen = $el.find("a").text().trim().length;
    const linkDensity = linkTextLen / (textLen || 1);
    const linkPenalty = linkDensity > 0.5 ? -30 : linkDensity > 0.3 ? -15 : 0;

    // Image-heavy sections get a small bonus (galleries, media articles)
    const imgCount = $el.find("img").length;
    const imgBonus = Math.min(imgCount * 2, 10);

    const score =
      density * 100 +
      pCount * 3 +
      classScore +
      linkPenalty +
      imgBonus +
      Math.log(textLen) * 5; // Length bonus (log scale)

    candidates.push({ el: $el, score });
  });

  if (candidates.length === 0) {
    // Fallback: return entire body
    return $("body").html() ?? "";
  }

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);

  // Return the best candidate
  return candidates[0].el.html() ?? "";
}

/**
 * Quick text extraction — strips all HTML, returns plain text.
 * Used for snippet generation.
 */
export function extractText($: CheerioAPI): string {
  for (const tag of STRIP_TAGS) {
    $(tag).remove();
  }
  return $("body").text().replace(/\s+/g, " ").trim();
}
