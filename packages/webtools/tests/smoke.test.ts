import { describe, it, expect } from "vitest";
import { webSearch } from "../src/search.js";
import { webFetch } from "../src/fetch.js";

describe("smoke test", () => {
  it("webSearch: 5 queries via Google", async () => {
    const queries = [
      "react useEffect cleanup function",
      "stripe payment intent create node.js",
      "solana web3.js get balance",
      "typescript generic constraints",
      "docker compose yaml example",
    ];

    for (const q of queries) {
      const t0 = performance.now();
      const results = await webSearch(q, { maxResults: 3, timeoutMs: 8000 });
      const ms = Math.round(performance.now() - t0);
      console.log(`  ✓ ${ms}ms [${results.length}] ${q}`);
      if (results[0]) console.log(`    → ${results[0].title} | ${results[0].url}`);
      expect(results.length).toBeGreaterThan(0);
      // Small delay
      await new Promise(r => setTimeout(r, 500));
    }
  }, 60_000);

  it("webFetch: MDN Array.map", async () => {
    const t0 = performance.now();
    const page = await webFetch("https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map");
    const ms = Math.round(performance.now() - t0);
    console.log(`  ✓ ${ms}ms, ${page.wordCount} words, title: "${page.title}"`);
    console.log(`  excerpt: ${page.excerpt}`);
    expect(page.wordCount).toBeGreaterThan(50);
    expect(page.content).toMatch(/map|array|callback/i);
  }, 15_000);

  it("webFetch: Vite guide", async () => {
    const t0 = performance.now();
    const page = await webFetch("https://vitejs.dev/guide/");
    const ms = Math.round(performance.now() - t0);
    console.log(`  ✓ ${ms}ms, ${page.wordCount} words, title: "${page.title}"`);
    console.log(`  excerpt: ${page.excerpt}`);
    expect(page.wordCount).toBeGreaterThan(10);
  }, 15_000);
});
