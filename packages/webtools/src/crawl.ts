/**
 * Recursive documentation crawler.
 *
 * Given a starting URL and a query, fetches the page, extracts content + links,
 * scores links by relevance, and follows the most promising ones on the same
 * domain. Stops when enough content is found or limits are reached.
 *
 * Designed for documentation sites where the answer may live 1-2 clicks deep.
 */

import * as cheerio from "cheerio";
import { extractContent } from "./extract.js";
import { htmlToMarkdown } from "./html-to-md.js";
import type { FetchOptions } from "./types.js";

// ── Types ──

export interface CrawlOptions extends FetchOptions {
  /** Search query — used to score link relevance (required) */
  query: string;
  /** Max pages to fetch total, including the starting URL (default 6) */
  maxPages?: number;
  /** Max depth from starting URL (default 2) */
  maxDepth?: number;
  /** Min word count to consider a page "useful" (default 50) */
  minWords?: number;
  /** Stop crawling once accumulated content exceeds this word count (default 3000) */
  targetWords?: number;
  /** Called for each page fetched — for progress logging */
  onPage?: (url: string, wordCount: number, depth: number) => void;
}

export interface CrawlPage {
  url: string;
  title: string;
  content: string;
  wordCount: number;
  depth: number;
}

export interface CrawlResult {
  pages: CrawlPage[];
  /** Aggregated markdown with source headers */
  content: string;
  totalWords: number;
  elapsedMs: number;
}

// ── Link extraction & scoring ──

interface ExtractedLink {
  href: string;
  text: string;
  context: string; // surrounding text for better scoring
}

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** URL path segments that typically point to docs content. */
const DOC_PATH_BONUS = /\/(docs?|api|guide|tutorial|reference|learn|getting-started|quickstart|handbook|manual|concepts|examples|cookbook|faq)\b/i;

/** URL patterns to always skip. */
const SKIP_PATTERNS = [
  /\.(png|jpg|jpeg|gif|svg|ico|pdf|zip|tar|gz|mp4|mp3|woff2?|ttf|eot)$/i,
  /\/(login|signin|signup|register|auth|oauth|logout|cart|checkout|pricing|download)\b/i,
  /\/(edit|delete|new|create|admin|settings|profile|account)\b/i,
  /#[^/]*$/,  // fragment-only links
  /^mailto:/i,
  /^tel:/i,
  /^javascript:/i,
];

function extractLinks($: cheerio.CheerioAPI, baseUrl: string): ExtractedLink[] {
  const links: ExtractedLink[] = [];
  const seen = new Set<string>();
  const base = new URL(baseUrl);

  $("a[href]").each((_, el) => {
    const $a = $(el);
    const rawHref = $a.attr("href");
    if (!rawHref) return;

    // Resolve relative URLs
    let resolved: URL;
    try {
      resolved = new URL(rawHref, baseUrl);
    } catch {
      return;
    }

    // Same origin only
    if (resolved.origin !== base.origin) return;

    // Strip fragment, normalize
    resolved.hash = "";
    const href = resolved.href;

    // Dedup
    if (seen.has(href) || href === baseUrl) return;
    seen.add(href);

    // Skip non-content patterns
    if (SKIP_PATTERNS.some((re) => re.test(href))) return;

    const text = $a.text().trim();
    if (!text || text.length > 200) return; // skip empty or giant link text

    // Grab surrounding context (parent text, trimmed)
    const context = $a.parent().text().trim().slice(0, 300);

    links.push({ href, text, context });
  });

  return links;
}

function scoreLink(link: ExtractedLink, queryTerms: string[]): number {
  let score = 0;
  const textLower = link.text.toLowerCase();
  const hrefLower = link.href.toLowerCase();
  const contextLower = link.context.toLowerCase();

  // Query term matches
  for (const term of queryTerms) {
    if (textLower.includes(term)) score += 10;
    if (hrefLower.includes(term)) score += 5;
    if (contextLower.includes(term)) score += 3;
  }

  // Doc path bonus
  if (DOC_PATH_BONUS.test(link.href)) score += 4;

  // Prefer shorter paths (less likely to be deeply nested noise)
  const pathDepth = link.href.split("/").filter(Boolean).length;
  if (pathDepth <= 5) score += 2;

  // Penalty for very generic link text
  if (/^(home|about|contact|blog|news|press)$/i.test(link.text)) score -= 10;

  return score;
}

// ── Fetch single page ──

async function fetchPage(
  url: string,
  fetchFn: typeof globalThis.fetch,
  timeoutMs: number,
  extractMain: boolean,
): Promise<{ title: string; content: string; $: cheerio.CheerioAPI } | null> {
  try {
    const response = await fetchFn(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
    });

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("html") && !contentType.includes("xml")) return null;

    const html = await response.text();

    // Guard against binary content masquerading as HTML (Content-Type spoofing).
    // Real HTML is mostly printable ASCII; binary blobs have many control chars.
    const sample = html.slice(0, 512);
    let controlChars = 0;
    for (let i = 0; i < sample.length; i++) {
      const c = sample.charCodeAt(i);
      if (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) controlChars++;
    }
    if (sample.length > 0 && controlChars / sample.length > 0.1) return null;
    const $ = cheerio.load(html);

    const title =
      $("title").first().text().trim() ||
      $('meta[property="og:title"]').attr("content")?.trim() ||
      $("h1").first().text().trim() ||
      "";

    let contentHtml: string;
    if (extractMain) {
      contentHtml = extractContent($);
    } else {
      contentHtml = $("body").html() ?? "";
    }

    const $fragment = cheerio.load(contentHtml);
    const content = htmlToMarkdown($fragment);

    return { title, content, $ };
  } catch {
    return null;
  }
}

// ── Main crawl ──

export async function webCrawl(
  startUrl: string,
  options: CrawlOptions,
): Promise<CrawlResult> {
  const maxPages = options.maxPages ?? 6;
  const maxDepth = options.maxDepth ?? 2;
  const minWords = options.minWords ?? 50;
  const targetWords = options.targetWords ?? 3000;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxContentLength = options.maxContentLength ?? 50_000;
  const extractMain = options.extractMainContent ?? true;
  const fetchFn = options.fetchFn ?? globalThis.fetch;

  const queryTerms = options.query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2); // skip tiny words like "a", "in", etc.

  const t0 = performance.now();
  const visited = new Set<string>();
  const pages: CrawlPage[] = [];

  // BFS queue: [url, depth]
  const queue: Array<[string, number]> = [[startUrl, 0]];
  let totalWords = 0;

  while (queue.length > 0 && pages.length < maxPages && totalWords < targetWords) {
    const [url, depth] = queue.shift()!;

    // Normalize URL for dedup
    const normalized = url.replace(/#.*$/, "").replace(/\/$/, "");
    if (visited.has(normalized)) continue;
    visited.add(normalized);

    const result = await fetchPage(url, fetchFn, timeoutMs, extractMain);
    if (!result) continue;

    const wordCount = result.content.split(/\s+/).filter(Boolean).length;

    options.onPage?.(url, wordCount, depth);

    // Only include pages with meaningful content
    if (wordCount >= minWords) {
      // Truncate individual page content
      let pageContent = result.content;
      if (pageContent.length > maxContentLength / maxPages) {
        pageContent = pageContent.slice(0, Math.floor(maxContentLength / maxPages)) + "\n\n[Content truncated]";
      }

      pages.push({
        url,
        title: result.title,
        content: pageContent,
        wordCount,
        depth,
      });
      totalWords += wordCount;
    }

    // Extract and score links for next level
    if (depth < maxDepth && totalWords < targetWords) {
      const links = extractLinks(result.$, url);
      const scored = links
        .map((link) => ({ link, score: scoreLink(link, queryTerms) }))
        .filter((s) => s.score > 0) // only follow relevant links
        .sort((a, b) => b.score - a.score);

      // Add top links to queue
      const limit = Math.min(scored.length, maxPages * 2); // overshoot slightly, visited set dedupes
      for (let i = 0; i < limit; i++) {
        const href = scored[i].link.href;
        const normalizedHref = href.replace(/#.*$/, "").replace(/\/$/, "");
        if (!visited.has(normalizedHref)) {
          queue.push([href, depth + 1]);
        }
      }
    }
  }

  // Build aggregated content
  const contentParts = pages.map((p) => {
    const source = p.url !== startUrl ? `\n> Source: ${p.url}\n` : "";
    return `## ${p.title || p.url}${source}\n${p.content}`;
  });

  const content = contentParts.join("\n\n---\n\n");

  return {
    pages,
    content: content.length > maxContentLength
      ? content.slice(0, maxContentLength) + "\n\n[Content truncated]"
      : content,
    totalWords,
    elapsedMs: Math.round(performance.now() - t0),
  };
}
