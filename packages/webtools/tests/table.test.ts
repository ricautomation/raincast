import { describe, it } from "vitest";
import { webSearch } from "../src/search.js";

const QUERIES = [
  "react useState hook example",
  "solana web3.js send transaction",
  "how to center a div css",
  "stripe checkout session node.js",
  "rust async await tokio tutorial",
  "next.js server actions form",
  "docker compose environment variables",
  "openai function calling api",
  "prisma many to many relation",
  "tailwindcss dark mode toggle",
  "git cherry pick commit from another branch",
  "python fastapi websocket example",
  "kubernetes pod restart policy",
  "redis pub sub node.js",
  "supabase realtime subscription",
  "vitest mock fetch api",
  "terraform aws lambda function",
  "firebase cloud messaging push notification",
  "ethers.js sign message wallet",
  "claude api tool use example",
];

describe("20-query table", () => {
  it("run and display", async () => {
    const rows: Array<{ i: number; query: string; ms: number; engine: string; top: string; url: string; ok: boolean }> = [];

    for (let i = 0; i < QUERIES.length; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 400));
      const q = QUERIES[i];
      const t0 = performance.now();
      try {
        const results = await webSearch(q, { maxResults: 3, timeoutMs: 8000 });
        const ms = Math.round(performance.now() - t0);
        rows.push({
          i: i + 1,
          query: q.length > 40 ? q.slice(0, 37) + "..." : q,
          ms,
          engine: "startpage",
          top: (results[0]?.title ?? "").slice(0, 42),
          url: (results[0]?.url ?? "").slice(0, 50),
          ok: results.length > 0,
        });
      } catch (err: unknown) {
        const ms = Math.round(performance.now() - t0);
        rows.push({
          i: i + 1,
          query: q.length > 40 ? q.slice(0, 37) + "..." : q,
          ms,
          engine: "FAIL",
          top: (err instanceof Error ? err.message : String(err)).slice(0, 42),
          url: "",
          ok: false,
        });
      }
    }

    // Print table
    const hdr = ["#", "Query", "ms", "Top Result", "URL", "✓"];
    const sep = ["-".repeat(3), "-".repeat(42), "-".repeat(6), "-".repeat(44), "-".repeat(52), "-".repeat(3)];

    console.log("\n");
    console.log(`| ${hdr.join(" | ")} |`);
    console.log(`| ${sep.join(" | ")} |`);

    for (const r of rows) {
      console.log(`| ${String(r.i).padStart(3)} | ${r.query.padEnd(42)} | ${String(r.ms).padStart(6)} | ${r.top.padEnd(44)} | ${r.url.padEnd(52)} | ${r.ok ? " ✓ " : " ✗ "} |`);
    }

    const times = rows.map(r => r.ms);
    const passed = rows.filter(r => r.ok).length;
    const median = times.sort((a, b) => a - b)[Math.floor(times.length / 2)];
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);

    console.log("");
    console.log(`Passed: ${passed}/${rows.length} | Median: ${median}ms | Avg: ${avg}ms | Min: ${times[0]}ms | Max: ${times[times.length - 1]}ms`);
    console.log("");
  }, 300_000);
});
