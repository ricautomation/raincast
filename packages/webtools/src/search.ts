/**
 * Web search — multi-engine with automatic fallback.
 *
 * Engine priority:
 *   1. Brave Search API (if API key provided — free tier: 2000/month)
 *   2. Startpage (Google results via privacy proxy, no API key)
 *   3. DuckDuckGo HTML (fallback, rate-limits aggressively)
 *
 * In production the user can provide a Brave API key for guaranteed reliability.
 * Without a key, Startpage handles most queries well.
 */

import * as cheerio from "cheerio";
import type { SearchResult, SearchOptions } from "./types.js";

export type { SearchResult, SearchOptions };

const DEFAULT_MAX_RESULTS = 5;
const DEFAULT_TIMEOUT_MS = 8000;

const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
];

function randomUa(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// ── Brave Search API ────────────────────────────────────────────────

async function searchBrave(
  query: string,
  maxResults: number,
  timeoutMs: number,
  apiKey: string,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    count: String(maxResults),
  });

  let response: Response;
  try {
    response = await fetchFn(`https://api.search.brave.com/res/v1/web/search?${params}`, {
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": apiKey,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    // Wrap network errors to prevent API key from leaking in stack traces
    throw new Error(`Brave Search network error: ${err instanceof Error ? err.message : "request failed"}`);
  }

  if (!response.ok) {
    throw new Error(`Brave Search returned ${response.status}`);
  }

  let data: { web?: { results?: Array<{ title: string; url: string; description: string }> } };
  try {
    data = await response.json();
  } catch {
    throw new Error("Brave Search returned invalid JSON");
  }

  return (data.web?.results ?? []).slice(0, maxResults).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.description,
  }));
}

// ── Startpage (privacy-focused Google proxy) ────────────────────────

function cleanText(text: string): string {
  // Startpage sometimes includes inline CSS/media queries in text nodes.
  // Strip brace-delimited blocks iteratively (safe against ReDoS — no nested quantifiers).
  let cleaned = text;
  let prev: string;
  do {
    prev = cleaned;
    cleaned = cleaned.replace(/\{[^{}]*\}/g, "");
  } while (cleaned !== prev); // repeat until no more {...} blocks
  return cleaned.replace(/\s+/g, " ").trim();
}

async function searchStartpage(
  query: string,
  maxResults: number,
  timeoutMs: number,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<SearchResult[]> {
  const response = await fetchFn("https://www.startpage.com/sp/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": randomUa(),
      "Accept": "text/html",
      "Accept-Language": "en-US,en;q=0.9",
    },
    body: `query=${encodeURIComponent(query)}&cat=web&language=english`,
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Startpage returned ${response.status}`);
  }

  const html = await response.text();

  // Detect block/captcha
  if (html.includes("captcha") || html.length < 5000) {
    throw new Error("Startpage blocked/captcha");
  }

  const $ = cheerio.load(html);
  const results: SearchResult[] = [];

  $(".result").each((_, el) => {
    if (results.length >= maxResults) return false;
    const $el = $(el);

    // Skip ads
    if ($el.hasClass("ad--loading") || $el.find(".ad-label").length > 0) return;

    const $a = $el.find("a.result-title, a.result-link").first();
    const url = $a.attr("href") ?? "";
    const rawTitle = $a.text();
    const title = cleanText(rawTitle);
    const snippet = cleanText($el.find("p.description, .result-description, p").first().text());

    if (title && url.startsWith("http")) {
      results.push({ title, url, snippet });
    }
  });

  return results;
}

// ── DuckDuckGo HTML (fallback) ──────────────────────────────────────

function extractDdgUrl(raw: string): string | null {
  if (raw.includes("duckduckgo.com/l/")) {
    try {
      const url = new URL(raw, "https://duckduckgo.com");
      const uddg = url.searchParams.get("uddg");
      if (uddg) return uddg;
    } catch { /* fall through */ }
  }
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (raw.startsWith("//")) return `https:${raw}`;
  return null;
}

async function searchDdg(
  query: string,
  maxResults: number,
  timeoutMs: number,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<SearchResult[]> {
  const response = await fetchFn("https://html.duckduckgo.com/html/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": randomUa(),
      "Accept": "text/html",
    },
    body: `q=${encodeURIComponent(query)}&b=`,
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
  });

  if (response.status === 202 || response.status === 403) {
    throw new Error(`DuckDuckGo blocked (${response.status})`);
  }
  if (!response.ok) {
    throw new Error(`DuckDuckGo returned ${response.status}`);
  }

  const html = await response.text();
  if (html.includes("captcha") || !html.includes("result__a")) {
    throw new Error("DuckDuckGo captcha page");
  }

  let $: cheerio.CheerioAPI;
  try {
    $ = cheerio.load(html);
  } catch {
    throw new Error("DuckDuckGo returned unparseable HTML");
  }
  const results: SearchResult[] = [];

  $(".result").each((_, el) => {
    if (results.length >= maxResults) return false;
    const $el = $(el);
    const $link = $el.find(".result__a").first();
    const title = $link.text().trim();
    const rawHref = $link.attr("href") ?? "";
    const url = extractDdgUrl(rawHref);
    const snippet = $el.find(".result__snippet").text().trim();
    if (title && url) results.push({ title, url, snippet });
  });

  return results;
}

// ── Public API ──────────────────────────────────────────────────────

type SearchEngine = (query: string, maxResults: number, timeoutMs: number, fetchFn: typeof globalThis.fetch) => Promise<SearchResult[]>;

/**
 * Search the web. Returns structured results (title, url, snippet).
 *
 * Engine fallback: Brave (if key) → Startpage → DuckDuckGo.
 *
 * @example
 * ```ts
 * const results = await webSearch("solana web3.js get balance");
 * // [{ title: "...", url: "https://...", snippet: "..." }, ...]
 * ```
 */
export async function webSearch(
  query: string,
  options?: SearchOptions,
): Promise<SearchResult[]> {
  const maxResults = options?.maxResults ?? DEFAULT_MAX_RESULTS;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchFn = options?.fetchFn ?? globalThis.fetch;

  const engines: Array<{ name: string; fn: SearchEngine }> = [];

  if (options?.engine) {
    switch (options.engine) {
      case "brave":
        if (options.braveApiKey) engines.push({ name: "brave", fn: (q, m, t, f) => searchBrave(q, m, t, options.braveApiKey!, f) });
        break;
      case "google":
        engines.push({ name: "startpage", fn: searchStartpage });
        break;
      case "duckduckgo":
        engines.push({ name: "duckduckgo", fn: searchDdg });
        break;
    }
  } else {
    if (options?.braveApiKey) {
      engines.push({ name: "brave", fn: (q, m, t, f) => searchBrave(q, m, t, options.braveApiKey!, f) });
    }
    engines.push({ name: "startpage", fn: searchStartpage });
    engines.push({ name: "duckduckgo", fn: searchDdg });
  }

  if (engines.length === 0) {
    engines.push({ name: "startpage", fn: searchStartpage });
    engines.push({ name: "duckduckgo", fn: searchDdg });
  }

  const errors: string[] = [];

  for (const engine of engines) {
    try {
      const results = await engine.fn(query, maxResults, timeoutMs, fetchFn);
      if (results.length > 0) return results;
      errors.push(`${engine.name}: 0 results`);
    } catch (err) {
      errors.push(`${engine.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  throw new Error(`Web search failed for "${query}": ${errors.join("; ")}`);
}
