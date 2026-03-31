// ── Search ──

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchOptions {
  /** Maximum results to return (default 5) */
  maxResults?: number;
  /** Timeout in ms (default 5000) */
  timeoutMs?: number;
  /** Search engine preference (default: tries all in order until one works) */
  engine?: "brave" | "google" | "duckduckgo";
  /** Brave Search API key (free tier: 2000 queries/month at https://brave.com/search/api/) */
  braveApiKey?: string;
  /** Custom fetch function — use this to inject a CORS-bypassing fetch (e.g. Tauri HTTP plugin) */
  fetchFn?: typeof globalThis.fetch;
}

// ── Fetch ──

export interface FetchResult {
  url: string;
  title: string;
  /** Extracted content as markdown */
  content: string;
  /** First ~200 chars of content */
  excerpt: string;
  /** Word count of extracted content */
  wordCount: number;
  /** Time to fetch + extract in ms */
  elapsedMs: number;
}

export interface FetchOptions {
  /** Max content chars (default 50000) */
  maxContentLength?: number;
  /** Timeout in ms (default 10000) */
  timeoutMs?: number;
  /** Extract main content only, stripping nav/footer/etc (default true) */
  extractMainContent?: boolean;
  /** Custom headers to send */
  headers?: Record<string, string>;
  /** Custom fetch function — use this to inject a CORS-bypassing fetch (e.g. Tauri HTTP plugin) */
  fetchFn?: typeof globalThis.fetch;
}
