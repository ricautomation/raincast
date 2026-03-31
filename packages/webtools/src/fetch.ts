/**
 * Web fetch — retrieve a URL and extract clean Markdown content.
 *
 * Pipeline (inspired by Firecrawl):
 *   1. HTTP fetch with proper headers (fast path, no browser)
 *   2. Parse HTML with cheerio
 *   3. Extract main content (readability-like scoring)
 *   4. Convert to Markdown
 *   5. Truncate to max length
 *
 * For most documentation / article / API reference pages, the fast path
 * is sufficient. JS-rendered SPAs would need a headless browser (future).
 */

import * as cheerio from "cheerio";
import { extractContent } from "./extract.js";
import { htmlToMarkdown } from "./html-to-md.js";
import type { FetchResult, FetchOptions } from "./types.js";

export type { FetchResult, FetchOptions };

const DEFAULT_MAX_CONTENT = 50_000;
const DEFAULT_TIMEOUT_MS = 10_000;

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * Fetch a URL and return its content as clean Markdown.
 *
 * @example
 * ```ts
 * const page = await webFetch("https://docs.solana.com/developing/clients/javascript-api");
 * console.log(page.title);   // "JavaScript API | Solana Docs"
 * console.log(page.content); // "# JavaScript API\n\n..."
 * ```
 */
export async function webFetch(
  url: string,
  options?: FetchOptions,
): Promise<FetchResult> {
  const maxContentLength = options?.maxContentLength ?? DEFAULT_MAX_CONTENT;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const shouldExtract = options?.extractMainContent ?? true;

  const fetchFn = options?.fetchFn ?? globalThis.fetch;
  const t0 = performance.now();

  // ── Fetch ──
  const response = await fetchFn(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      ...(options?.headers ?? {}),
    },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status} ${response.statusText} for ${url}`);
  }

  const contentType = response.headers.get("content-type") ?? "";

  // Non-HTML content: return raw text
  if (!contentType.includes("html") && !contentType.includes("xml")) {
    const text = await response.text();
    const content = text.slice(0, maxContentLength);
    return {
      url,
      title: "",
      content,
      excerpt: content.slice(0, 200).replace(/\n/g, " ").trim(),
      wordCount: content.split(/\s+/).filter(Boolean).length,
      elapsedMs: Math.round(performance.now() - t0),
    };
  }

  // ── Parse HTML ──
  const html = await response.text();
  const $ = cheerio.load(html);

  // ── Extract title ──
  const title =
    $("title").first().text().trim() ||
    $('meta[property="og:title"]').attr("content")?.trim() ||
    $("h1").first().text().trim() ||
    "";

  // ── Extract & convert ──
  let contentHtml: string;
  if (shouldExtract) {
    contentHtml = extractContent($);
  } else {
    contentHtml = $("body").html() ?? "";
  }

  // Re-parse the extracted fragment for markdown conversion
  const $fragment = cheerio.load(contentHtml);
  let content = htmlToMarkdown($fragment);

  // ── Truncate at a line boundary to avoid splitting markdown syntax ──
  if (content.length > maxContentLength) {
    // Find the last newline before the limit so we don't split mid-line
    const cut = content.lastIndexOf("\n", maxContentLength);
    content = content.slice(0, cut > 0 ? cut : maxContentLength);
    // Close any open fenced code blocks
    const fences = (content.match(/^```/gm) ?? []).length;
    if (fences % 2 !== 0) content += "\n```";
    content += "\n\n[Content truncated]";
  }

  const excerpt = content.slice(0, 200).replace(/\n/g, " ").trim();
  const wordCount = content.split(/\s+/).filter(Boolean).length;

  return {
    url,
    title,
    content,
    excerpt,
    wordCount,
    elapsedMs: Math.round(performance.now() - t0),
  };
}
