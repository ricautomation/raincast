/**
 * 100-query benchmark for @rain/webtools.
 *
 * Tests both webSearch and webFetch with real-world queries across
 * diverse categories. Measures accuracy and latency.
 *
 * Target: ≥95% accuracy, ≤950ms median (hard limit 1500ms).
 */

import { describe, it, expect } from "vitest";
import { webSearch } from "../src/search.js";
import { webFetch } from "../src/fetch.js";

// ── Search Queries (100 diverse real-world queries) ─────────────────

interface TestQuery {
  query: string;
  /** At least one result URL or snippet should match this pattern */
  expectMatch: RegExp;
  category: string;
}

const SEARCH_QUERIES: TestQuery[] = [
  // ── Programming API docs (20) ──
  { query: "react useEffect cleanup function example", expectMatch: /react|useeffect/i, category: "api-docs" },
  { query: "express.js middleware next function", expectMatch: /express|middleware/i, category: "api-docs" },
  { query: "typescript generic constraints extends", expectMatch: /typescript|generic/i, category: "api-docs" },
  { query: "python requests library post json", expectMatch: /python|requests/i, category: "api-docs" },
  { query: "rust ownership borrowing explained", expectMatch: /rust|ownership|borrow/i, category: "api-docs" },
  { query: "go goroutine channel example", expectMatch: /go|goroutine|channel/i, category: "api-docs" },
  { query: "swift async await concurrency", expectMatch: /swift|async|concurrency/i, category: "api-docs" },
  { query: "kotlin coroutines flow collect", expectMatch: /kotlin|coroutine|flow/i, category: "api-docs" },
  { query: "css grid template areas layout", expectMatch: /css|grid/i, category: "api-docs" },
  { query: "html dialog element modal native", expectMatch: /dialog|modal/i, category: "api-docs" },
  { query: "node.js crypto createHash sha256", expectMatch: /node|crypto|hash/i, category: "api-docs" },
  { query: "deno serve http server example", expectMatch: /deno|serve|http/i, category: "api-docs" },
  { query: "vue 3 composition api ref reactive", expectMatch: /vue|composition|ref/i, category: "api-docs" },
  { query: "svelte store writable subscribe", expectMatch: /svelte|store|writable/i, category: "api-docs" },
  { query: "angular signals computed effect", expectMatch: /angular|signal/i, category: "api-docs" },
  { query: "java stream filter map collect", expectMatch: /java|stream/i, category: "api-docs" },
  { query: "c# async task await pattern", expectMatch: /c#|async|task|await/i, category: "api-docs" },
  { query: "ruby on rails active record query", expectMatch: /rails|active.?record/i, category: "api-docs" },
  { query: "php laravel eloquent relationship", expectMatch: /laravel|eloquent/i, category: "api-docs" },
  { query: "elixir phoenix liveview socket", expectMatch: /elixir|phoenix|liveview/i, category: "api-docs" },

  // ── Error messages (15) ──
  { query: "TypeError Cannot read properties of undefined reading map javascript", expectMatch: /typeerror|undefined|map/i, category: "errors" },
  { query: "ECONNREFUSED 127.0.0.1 node.js", expectMatch: /econnrefused|connect|node/i, category: "errors" },
  { query: "Module not found Can't resolve react-dom", expectMatch: /module|resolve|react/i, category: "errors" },
  { query: "CORS policy No Access-Control-Allow-Origin", expectMatch: /cors|access.control|origin/i, category: "errors" },
  { query: "npm ERR ERESOLVE unable to resolve dependency tree", expectMatch: /npm|eresolve|dependency/i, category: "errors" },
  { query: "segmentation fault core dumped c++", expectMatch: /segmentation|fault|core/i, category: "errors" },
  { query: "OOMKilled kubernetes pod memory limit", expectMatch: /oom|kubernetes|memory/i, category: "errors" },
  { query: "SSL certificate problem unable to get local issuer", expectMatch: /ssl|certificate/i, category: "errors" },
  { query: "hydration mismatch server client react", expectMatch: /hydration|mismatch|server/i, category: "errors" },
  { query: "deadlock detected postgres transaction", expectMatch: /deadlock|postgres|transaction/i, category: "errors" },
  { query: "ENOMEM not enough memory node", expectMatch: /enomem|memory|node/i, category: "errors" },
  { query: "permission denied publickey ssh git", expectMatch: /permission|publickey|ssh/i, category: "errors" },
  { query: "react hook cannot be called conditionally", expectMatch: /react|hook|conditional/i, category: "errors" },
  { query: "webpack module parse failed unexpected token", expectMatch: /webpack|parse|token/i, category: "errors" },
  { query: "docker build failed to compute cache key", expectMatch: /docker|cache|key/i, category: "errors" },

  // ── Package/library usage (15) ──
  { query: "how to install tailwindcss with vite", expectMatch: /tailwind|vite/i, category: "packages" },
  { query: "prisma schema migration guide", expectMatch: /prisma|migration/i, category: "packages" },
  { query: "zustand state management react tutorial", expectMatch: /zustand|state/i, category: "packages" },
  { query: "drizzle orm postgres setup typescript", expectMatch: /drizzle|postgres/i, category: "packages" },
  { query: "zod schema validation typescript", expectMatch: /zod|validation/i, category: "packages" },
  { query: "tanstack query react useQuery example", expectMatch: /tanstack|query|usequery/i, category: "packages" },
  { query: "framer motion animation react spring", expectMatch: /framer|motion|animation/i, category: "packages" },
  { query: "vitest testing setup vite config", expectMatch: /vitest|test/i, category: "packages" },
  { query: "turborepo monorepo setup workspace", expectMatch: /turborepo|monorepo/i, category: "packages" },
  { query: "shadcn ui install components", expectMatch: /shadcn|component/i, category: "packages" },
  { query: "pnpm workspace monorepo config", expectMatch: /pnpm|workspace/i, category: "packages" },
  { query: "bun runtime install dependencies", expectMatch: /bun|runtime|install/i, category: "packages" },
  { query: "esbuild bundle typescript esm", expectMatch: /esbuild|bundle/i, category: "packages" },
  { query: "playwright test browser automation", expectMatch: /playwright|test|browser/i, category: "packages" },
  { query: "redis node.js ioredis connect", expectMatch: /redis|ioredis/i, category: "packages" },

  // ── API integration (15) ──
  { query: "stripe payment intent create node.js", expectMatch: /stripe|payment/i, category: "api" },
  { query: "openai chat completion api node sdk", expectMatch: /openai|chat|completion/i, category: "api" },
  { query: "anthropic claude api messages create", expectMatch: /anthropic|claude|api/i, category: "api" },
  { query: "firebase auth sign in with email password", expectMatch: /firebase|auth|sign/i, category: "api" },
  { query: "supabase database insert row javascript", expectMatch: /supabase|database|insert/i, category: "api" },
  { query: "aws s3 upload file node.js sdk v3", expectMatch: /aws|s3|upload/i, category: "api" },
  { query: "google maps javascript api marker", expectMatch: /google|maps|marker/i, category: "api" },
  { query: "twilio send sms node.js api", expectMatch: /twilio|sms/i, category: "api" },
  { query: "github rest api create issue octokit", expectMatch: /github|api|issue|octokit/i, category: "api" },
  { query: "vercel ai sdk streaming response", expectMatch: /vercel|ai|stream/i, category: "api" },
  { query: "cloudflare workers fetch api kv store", expectMatch: /cloudflare|worker/i, category: "api" },
  { query: "resend email api send typescript", expectMatch: /resend|email/i, category: "api" },
  { query: "plaid link token create api", expectMatch: /plaid|link|token/i, category: "api" },
  { query: "spotify web api search track authorization", expectMatch: /spotify|api|track/i, category: "api" },
  { query: "discord bot slash command register", expectMatch: /discord|bot|slash/i, category: "api" },

  // ── Framework specific (10) ──
  { query: "tauri 2 invoke command from frontend", expectMatch: /tauri|invoke|command/i, category: "framework" },
  { query: "next.js app router server component", expectMatch: /next|app.?router|server/i, category: "framework" },
  { query: "remix loader action form data", expectMatch: /remix|loader|action/i, category: "framework" },
  { query: "astro content collections markdown", expectMatch: /astro|content|collection/i, category: "framework" },
  { query: "electron ipc main renderer communication", expectMatch: /electron|ipc|renderer/i, category: "framework" },
  { query: "react native expo navigation stack", expectMatch: /react.native|expo|navigation/i, category: "framework" },
  { query: "flutter widget stateful lifecycle", expectMatch: /flutter|widget|stateful/i, category: "framework" },
  { query: "django rest framework serializer viewset", expectMatch: /django|serializer|viewset/i, category: "framework" },
  { query: "spring boot rest controller annotation", expectMatch: /spring|controller|annotation/i, category: "framework" },
  { query: "fastapi pydantic model endpoint", expectMatch: /fastapi|pydantic/i, category: "framework" },

  // ── General coding (10) ──
  { query: "css flexbox center element vertically horizontally", expectMatch: /flexbox|center/i, category: "general" },
  { query: "git rebase vs merge difference", expectMatch: /git|rebase|merge/i, category: "general" },
  { query: "regex match email address pattern", expectMatch: /regex|email|pattern/i, category: "general" },
  { query: "javascript debounce function implementation", expectMatch: /debounce|javascript/i, category: "general" },
  { query: "big o notation time complexity cheat sheet", expectMatch: /big.o|complexity/i, category: "general" },
  { query: "rest api best practices design guide", expectMatch: /rest|api|best.practice/i, category: "general" },
  { query: "websocket vs server sent events comparison", expectMatch: /websocket|server.sent|sse/i, category: "general" },
  { query: "oauth 2.0 authorization code flow", expectMatch: /oauth|authorization|flow/i, category: "general" },
  { query: "sql join types inner outer left right", expectMatch: /sql|join|inner|outer/i, category: "general" },
  { query: "docker compose multi stage build", expectMatch: /docker|compose|multi.stage/i, category: "general" },

  // ── Blockchain / Web3 (5) ──
  { query: "solana web3.js get token balance account", expectMatch: /solana|web3|token|balance/i, category: "web3" },
  { query: "ethers.js connect wallet metamask provider", expectMatch: /ethers|wallet|metamask/i, category: "web3" },
  { query: "viem wagmi react hooks contract read", expectMatch: /viem|wagmi|contract/i, category: "web3" },
  { query: "anchor solana program deploy devnet", expectMatch: /anchor|solana|program/i, category: "web3" },
  { query: "hardhat smart contract test deploy", expectMatch: /hardhat|smart.contract|deploy/i, category: "web3" },

  // ── DevOps / Tools (5) ──
  { query: "github actions workflow deploy to vercel", expectMatch: /github.action|workflow|vercel/i, category: "devops" },
  { query: "terraform aws ec2 instance resource", expectMatch: /terraform|aws|ec2/i, category: "devops" },
  { query: "nginx reverse proxy configuration", expectMatch: /nginx|reverse.proxy/i, category: "devops" },
  { query: "grafana prometheus dashboard setup", expectMatch: /grafana|prometheus/i, category: "devops" },
  { query: "kubernetes deployment yaml example", expectMatch: /kubernetes|deployment|yaml/i, category: "devops" },

  // ── Data / ML (5) ──
  { query: "pandas dataframe read csv filter rows", expectMatch: /pandas|dataframe|csv/i, category: "data" },
  { query: "pytorch neural network training loop", expectMatch: /pytorch|neural|training/i, category: "data" },
  { query: "hugging face transformers pipeline", expectMatch: /hugging.?face|transformer|pipeline/i, category: "data" },
  { query: "scikit learn random forest classifier", expectMatch: /scikit|random.forest|classifier/i, category: "data" },
  { query: "apache spark dataframe sql query", expectMatch: /spark|dataframe|sql/i, category: "data" },
];

// ── Fetch URLs (20 diverse real-world pages) ────────────────────────

interface FetchTest {
  url: string;
  /** Content should contain this pattern */
  expectContent: RegExp;
  label: string;
}

const FETCH_URLS: FetchTest[] = [
  { url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map", expectContent: /map|array|callback/i, label: "MDN Array.map" },
  { url: "https://react.dev/reference/react/useState", expectContent: /useState|state|hook/i, label: "React useState docs" },
  { url: "https://docs.github.com/en/rest/issues/issues", expectContent: /issue|create|api/i, label: "GitHub REST API" },
  { url: "https://tailwindcss.com/docs/installation", expectContent: /install|tailwind/i, label: "Tailwind install" },
  { url: "https://vitejs.dev/guide/", expectContent: /vite|getting.started|install/i, label: "Vite guide" },
  { url: "https://www.typescriptlang.org/docs/handbook/2/generics.html", expectContent: /generic|type|typescript/i, label: "TS generics" },
  { url: "https://docs.npmjs.com/cli/v10/commands/npm-install", expectContent: /npm|install|package/i, label: "npm install docs" },
  { url: "https://docs.rs/tokio/latest/tokio/", expectContent: /tokio|async|runtime/i, label: "Tokio Rust docs" },
  { url: "https://platform.openai.com/docs/api-reference/chat", expectContent: /chat|completion|message/i, label: "OpenAI Chat API" },
  { url: "https://docs.docker.com/compose/compose-file/", expectContent: /compose|service|container/i, label: "Docker Compose docs" },
  { url: "https://en.wikipedia.org/wiki/Rust_(programming_language)", expectContent: /rust|programming|language/i, label: "Wikipedia Rust" },
  { url: "https://nodejs.org/en/learn/getting-started/introduction-to-nodejs", expectContent: /node|javascript|server/i, label: "Node.js intro" },
  { url: "https://docs.python.org/3/tutorial/datastructures.html", expectContent: /list|dict|data.structure/i, label: "Python data structures" },
  { url: "https://go.dev/doc/tutorial/getting-started", expectContent: /go|module|hello/i, label: "Go getting started" },
  { url: "https://www.postgresql.org/docs/current/sql-select.html", expectContent: /select|from|where/i, label: "PostgreSQL SELECT" },
  { url: "https://redis.io/docs/latest/commands/get/", expectContent: /get|key|value|string/i, label: "Redis GET docs" },
  { url: "https://docs.stripe.com/api/payment_intents", expectContent: /payment|intent|stripe/i, label: "Stripe PaymentIntents" },
  { url: "https://kubernetes.io/docs/concepts/workloads/pods/", expectContent: /pod|container|kubernetes/i, label: "K8s Pods" },
  { url: "https://www.prisma.io/docs/getting-started", expectContent: /prisma|database|schema/i, label: "Prisma getting started" },
  { url: "https://docs.anthropic.com/en/docs/build-with-claude/overview", expectContent: /claude|api|message/i, label: "Anthropic API docs" },
];

// ── Test runner ─────────────────────────────────────────────────────

describe("webSearch benchmark (100 queries)", () => {
  const results: Array<{
    query: string;
    category: string;
    success: boolean;
    resultCount: number;
    elapsedMs: number;
    error?: string;
  }> = [];

  // Run all 100 search queries (sequential with small delay to avoid rate-limiting)
  for (let i = 0; i < SEARCH_QUERIES.length; i++) {
    const q = SEARCH_QUERIES[i];

    it(`[${i + 1}/100] ${q.category}: "${q.query}"`, async () => {
      // Small delay between queries to avoid rate limiting
      if (i > 0) await new Promise(r => setTimeout(r, 400));

      const t0 = performance.now();
      try {
        const searchResults = await webSearch(q.query, { maxResults: 5, timeoutMs: 8000 });
        const elapsed = Math.round(performance.now() - t0);

        const matched = searchResults.some(
          (r) => q.expectMatch.test(r.title) || q.expectMatch.test(r.url) || q.expectMatch.test(r.snippet),
        );

        results.push({
          query: q.query,
          category: q.category,
          success: matched && searchResults.length > 0,
          resultCount: searchResults.length,
          elapsedMs: elapsed,
        });

        expect(searchResults.length).toBeGreaterThan(0);
        expect(matched).toBe(true);
        expect(elapsed).toBeLessThan(1500);
      } catch (err) {
        const elapsed = Math.round(performance.now() - t0);
        results.push({
          query: q.query,
          category: q.category,
          success: false,
          resultCount: 0,
          elapsedMs: elapsed,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    }, 10_000);
  }

  // Summary (runs after all queries)
  it("SUMMARY: ≥95% accuracy, median ≤950ms", () => {
    if (results.length === 0) return; // Skip if no results yet

    const total = results.length;
    const passed = results.filter((r) => r.success).length;
    const accuracy = (passed / total) * 100;

    const latencies = results.map((r) => r.elapsedMs).sort((a, b) => a - b);
    const median = latencies[Math.floor(latencies.length / 2)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const avg = Math.round(latencies.reduce((a, b) => a + b, 0) / total);

    // Group by category
    const byCategory = new Map<string, { total: number; passed: number; avgMs: number }>();
    for (const r of results) {
      const cat = byCategory.get(r.category) ?? { total: 0, passed: 0, avgMs: 0 };
      cat.total++;
      if (r.success) cat.passed++;
      cat.avgMs += r.elapsedMs;
      byCategory.set(r.category, cat);
    }
    for (const [, cat] of byCategory) {
      cat.avgMs = Math.round(cat.avgMs / cat.total);
    }

    console.log("\n\n══════════════════════════════════════════");
    console.log("  WEB SEARCH BENCHMARK RESULTS");
    console.log("══════════════════════════════════════════");
    console.log(`  Total queries: ${total}`);
    console.log(`  Passed:        ${passed}/${total} (${accuracy.toFixed(1)}%)`);
    console.log(`  Median:        ${median}ms`);
    console.log(`  Average:       ${avg}ms`);
    console.log(`  P95:           ${p95}ms`);
    console.log(`  Min:           ${latencies[0]}ms`);
    console.log(`  Max:           ${latencies[latencies.length - 1]}ms`);
    console.log("");
    console.log("  By category:");
    for (const [cat, stats] of byCategory) {
      console.log(`    ${cat.padEnd(12)} ${stats.passed}/${stats.total} passed, avg ${stats.avgMs}ms`);
    }

    const failures = results.filter((r) => !r.success);
    if (failures.length > 0) {
      console.log("");
      console.log(`  Failed queries (${failures.length}):`);
      for (const f of failures) {
        console.log(`    ✗ "${f.query}" — ${f.error ?? "no relevant results"}`);
      }
    }
    console.log("══════════════════════════════════════════\n");

    expect(accuracy).toBeGreaterThanOrEqual(95);
    expect(median).toBeLessThanOrEqual(950);
  });
});

describe("webFetch benchmark (20 pages)", () => {
  const results: Array<{
    label: string;
    success: boolean;
    wordCount: number;
    elapsedMs: number;
    error?: string;
  }> = [];

  for (let i = 0; i < FETCH_URLS.length; i++) {
    const f = FETCH_URLS[i];

    it(`[${i + 1}/20] ${f.label}`, async () => {
      const t0 = performance.now();
      try {
        const page = await webFetch(f.url, { timeoutMs: 10_000 });
        const elapsed = Math.round(performance.now() - t0);

        const matched = f.expectContent.test(page.content) || f.expectContent.test(page.title);

        results.push({
          label: f.label,
          success: matched && page.wordCount > 10,
          wordCount: page.wordCount,
          elapsedMs: elapsed,
        });

        expect(page.wordCount).toBeGreaterThan(10);
        expect(matched).toBe(true);
        expect(elapsed).toBeLessThan(5000);
      } catch (err) {
        const elapsed = Math.round(performance.now() - t0);
        results.push({
          label: f.label,
          success: false,
          wordCount: 0,
          elapsedMs: elapsed,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    }, 15_000);
  }

  it("SUMMARY: ≥90% accuracy, median ≤1500ms", () => {
    if (results.length === 0) return;

    const total = results.length;
    const passed = results.filter((r) => r.success).length;
    const accuracy = (passed / total) * 100;

    const latencies = results.map((r) => r.elapsedMs).sort((a, b) => a - b);
    const median = latencies[Math.floor(latencies.length / 2)];
    const avg = Math.round(latencies.reduce((a, b) => a + b, 0) / total);

    console.log("\n\n══════════════════════════════════════════");
    console.log("  WEB FETCH BENCHMARK RESULTS");
    console.log("══════════════════════════════════════════");
    console.log(`  Total pages: ${total}`);
    console.log(`  Passed:      ${passed}/${total} (${accuracy.toFixed(1)}%)`);
    console.log(`  Median:      ${median}ms`);
    console.log(`  Average:     ${avg}ms`);
    console.log(`  Min:         ${latencies[0]}ms`);
    console.log(`  Max:         ${latencies[latencies.length - 1]}ms`);

    const failures = results.filter((r) => !r.success);
    if (failures.length > 0) {
      console.log("");
      console.log(`  Failed (${failures.length}):`);
      for (const f of failures) {
        console.log(`    ✗ ${f.label} — ${f.error ?? "content mismatch"}`);
      }
    }
    console.log("══════════════════════════════════════════\n");

    expect(accuracy).toBeGreaterThanOrEqual(90);
    expect(median).toBeLessThanOrEqual(1500);
  });
});
