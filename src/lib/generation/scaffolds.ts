/**
 * Scaffold tiers for generated apps.
 *
 * Each tier provides a WORKING project that compiles and runs out of the box.
 * The AI only generates app-specific files (App.tsx, components, etc.) on top.
 *
 * Tiers:
 *   simple      – Pure React + Vite. No CSS framework. For static UIs.
 *   standard    – React + Tailwind CSS + utility hooks. Most common choice.
 *   interactive – Standard + React Router. For multi-page apps.
 *   system      – Interactive + Tauri bridge. For OS-integrated apps.
 *
 * Layout archetypes (optional, applied on top of tier):
 *   dashboard, editor, chat, file-manager, media, data-table, utility, generic
 */

import { type LayoutArchetype, getLayoutTemplate, DESKTOP_NATIVE_CSS } from "./templates";

export type ScaffoldTier = "simple" | "standard" | "interactive" | "system";

export interface ScaffoldFile {
  path: string;
  content: string;
}

export interface Scaffold {
  tier: ScaffoldTier;
  name: string;
  description: string;
  files: ScaffoldFile[];
  /** Injected into the AI prompt so it knows what exists. */
  promptContext: string;
  /** Files the AI should NOT regenerate (it can modify them if needed). */
  protectedFiles: string[];
}

// ── Shared base files ──────────────────────────────────────────────

const TSCONFIG: ScaffoldFile = {
  path: "tsconfig.json",
  content: `{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false
  },
  "include": ["src"]
}
`,
};

const VITE_CONFIG: ScaffoldFile = {
  path: "vite.config.ts",
  content: `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    // Dev-only: serve local filesystem files so Tauri's convertFileSrc works in dev preview.
    // In production, Tauri's asset:// protocol handles this natively.
    // In dev mode, bridge.ts polyfills convertFileSrc to return /__local_asset__/... URLs.
    {
      name: "local-asset-server",
      configureServer(server) {
        server.middlewares.use("/__local_asset__", (req, res) => {
          const filePath = decodeURIComponent((req.url || "").slice(1));
          if (!filePath || !path.isAbsolute(filePath)) {
            res.statusCode = 400;
            res.end("Bad path");
            return;
          }
          const stream = fs.createReadStream(filePath);
          stream.on("error", () => { res.statusCode = 404; res.end(); });
          stream.pipe(res);
        });
      },
    },
  ],
});
`,
};

const VITE_ENV: ScaffoldFile = {
  path: "src/vite-env.d.ts",
  content: `/// <reference types="vite/client" />
`,
};

const INDEX_HTML: ScaffoldFile = {
  path: "index.html",
  content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
};

const MAIN_TSX: ScaffoldFile = {
  path: "src/main.tsx",
  content: `import "./lib/runtimeCapture";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`,
};

const HELLO_APP: ScaffoldFile = {
  path: "src/App.tsx",
  content: `export default function App() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
      <h1>Hello World</h1>
    </div>
  );
}
`,
};

// ── Simple tier ────────────────────────────────────────────────────

const SIMPLE_PKG: ScaffoldFile = {
  path: "package.json",
  content: `{
  "name": "raincast-app",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.7.0",
    "vite": "^6.0.0"
  }
}
`,
};

const SIMPLE_CSS: ScaffoldFile = {
  path: "src/index.css",
  content: `*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: #1a1a1a;
  background: #ffffff;
}

${DESKTOP_NATIVE_CSS}
`,
};

// ── Standard tier (adds Tailwind + utilities) ──────────────────────

const STANDARD_PKG: ScaffoldFile = {
  path: "package.json",
  content: `{
  "name": "raincast-app",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "clsx": "^2.1.1",
    "lucide-react": "^0.468.0",
    "recharts": "^2.15.0",
    "@tauri-apps/api": "^2"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "tailwindcss": "^3.4.17",
    "postcss": "^8.4.49",
    "autoprefixer": "^10.4.20"
  }
}
`,
};

const TAILWIND_CONFIG: ScaffoldFile = {
  path: "tailwind.config.js",
  content: `/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
};
`,
};

const POSTCSS_CONFIG: ScaffoldFile = {
  path: "postcss.config.js",
  content: `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`,
};

const TAILWIND_CSS: ScaffoldFile = {
  path: "src/index.css",
  content: `@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

${DESKTOP_NATIVE_CSS}
`,
};

const CN_UTIL: ScaffoldFile = {
  path: "src/lib/cn.ts",
  content: `import { clsx, type ClassValue } from "clsx";

/** Merge class names. Supports conditional classes via clsx. */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}
`,
};

const USE_LOCAL_STORAGE: ScaffoldFile = {
  path: "src/hooks/useLocalStorage.ts",
  content: `import { useState, useEffect } from "react";

/**
 * Like useState, but persists to localStorage.
 * Falls back to initialValue if nothing is stored.
 */
export function useLocalStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? (JSON.parse(stored) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // quota exceeded or private browsing
    }
  }, [key, value]);

  return [value, setValue] as const;
}
`,
};

const USE_DRAG: ScaffoldFile = {
  path: "src/hooks/useDrag.ts",
  content: `import { useCallback } from "react";

let _appWindow: { startDragging: () => void; toggleMaximize: () => void } | null = null;
let _loadAttempted = false;

async function getAppWindow() {
  if (_appWindow) return _appWindow;
  if (_loadAttempted) return null;
  _loadAttempted = true;
  try {
    const mod = await import("@tauri-apps/api/window");
    _appWindow = mod.getCurrentWindow();
    return _appWindow;
  } catch {
    return null;
  }
}

/**
 * Returns an onMouseDown handler for window dragging.
 * Attach to any element that should be draggable.
 * Add data-no-drag to interactive children (buttons, inputs) to exclude them.
 *
 * Usage:
 *   const onDrag = useDrag();
 *   <div onMouseDown={onDrag}> ... <button data-no-drag>Click</button> </div>
 */
export function useDrag() {
  return useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("[data-no-drag]")) return;
    if (e.buttons !== 1) return;
    getAppWindow().then((w) => {
      if (!w) return;
      if (e.detail === 2) w.toggleMaximize();
      else w.startDragging();
    });
  }, []);
}
`,
};

const TAILWIND_APP: ScaffoldFile = {
  path: "src/App.tsx",
  content: `export default function App() {
  return (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <h1 className="text-3xl font-bold text-gray-900">Hello World</h1>
    </div>
  );
}
`,
};

// ── Interactive tier (adds React Router) ───────────────────────────

const INTERACTIVE_PKG: ScaffoldFile = {
  path: "package.json",
  content: `{
  "name": "raincast-app",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^6.28.0",
    "clsx": "^2.1.1",
    "lucide-react": "^0.468.0",
    "recharts": "^2.15.0",
    "@tauri-apps/api": "^2"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "tailwindcss": "^3.4.17",
    "postcss": "^8.4.49",
    "autoprefixer": "^10.4.20"
  }
}
`,
};

const ROUTER_MAIN: ScaffoldFile = {
  path: "src/main.tsx",
  content: `import "./lib/runtimeCapture";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
`,
};

const ROUTER_APP: ScaffoldFile = {
  path: "src/App.tsx",
  content: `import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
      </Route>
    </Routes>
  );
}
`,
};

const LAYOUT_COMPONENT: ScaffoldFile = {
  path: "src/components/Layout.tsx",
  content: `import { Outlet } from "react-router-dom";

export default function Layout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white px-6 py-3">
        <h1 className="text-lg font-semibold text-gray-900">App</h1>
      </header>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
}
`,
};

const HOME_PAGE: ScaffoldFile = {
  path: "src/pages/Home.tsx",
  content: `export default function Home() {
  return (
    <div className="flex items-center justify-center py-20">
      <h2 className="text-2xl font-bold text-gray-900">Hello World</h2>
    </div>
  );
}
`,
};

// ── System tier (adds Tauri bridge) ────────────────────────────────

const SYSTEM_PKG: ScaffoldFile = {
  path: "package.json",
  content: `{
  "name": "raincast-app",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^6.28.0",
    "clsx": "^2.1.1",
    "lucide-react": "^0.468.0",
    "recharts": "^2.15.0",
    "@tauri-apps/api": "^2"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "tailwindcss": "^3.4.17",
    "postcss": "^8.4.49",
    "autoprefixer": "^10.4.20"
  }
}
`,
};

const BRIDGE: ScaffoldFile = {
  path: "src/lib/bridge.ts",
  content: `/**
 * Unified invoke bridge — auto-routes to the right backend.
 *
 * Environment detection (checked in order):
 *   1. Tauri webview (prod) → real __TAURI_INTERNALS__ invoke
 *   2. Dev proxy (dev)      → postMessage to Raincast host → proxy_tauri command
 *
 * Usage:
 *   import { invoke, listen } from "./lib/bridge";
 *   const data = await invoke<string>("read_file", { path: "/tmp/hello.txt" });
 */

// ── Environment detection ──

const isTauri = !!(window as any).__TAURI_INTERNALS__;
const isDevMode = !isTauri && window.parent !== window;

// ── Arg key conversion ──
// Tauri 2 IPC expects camelCase arg keys (Rust snake_case → JS camelCase).

function toCamelCase(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function camelCaseArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    out[toCamelCase(k)] = v;
  }
  return out;
}

// ── Dev proxy via postMessage ──

type Pending = { resolve: (v: unknown) => void; reject: (e: unknown) => void };
const pending = new Map<string, Pending>();
let idSeq = 0;
function nextId() { return "p" + (++idSeq) + "_" + Date.now().toString(36); }

// Event listener callbacks for dev-proxy mode
const eventListeners = new Map<string, Set<(payload: unknown) => void>>();

// Listen for proxy results and event payloads from Raincast host
if (isDevMode) {
  window.addEventListener("message", (event) => {
    const msg = event.data;
    if (!msg || typeof msg !== "object") return;

    if (msg.type === "proxy-result" && msg.id) {
      const p = pending.get(msg.id);
      if (p) { pending.delete(msg.id); p.resolve(msg.result); }
    } else if (msg.type === "proxy-error" && msg.id) {
      const p = pending.get(msg.id);
      if (p) { pending.delete(msg.id); p.reject(new Error(msg.error || "Proxy error")); }
    } else if (msg.type === "proxy-event" && msg.event) {
      const cbs = eventListeners.get(msg.event);
      if (cbs) cbs.forEach((cb) => { try { cb(msg.payload); } catch {} });
    }
  });
}

function invokeViaProxy<T>(command: string, args: Record<string, unknown>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = nextId();
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });

    window.parent.postMessage({
      type: "proxy-invoke",
      id,
      command,
      args,
    }, "*");

    // Timeout after 30s
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(\`Timeout: \${command}\`));
      }
    }, 30_000);
  });
}

// ── Dev mode polyfill ──
// Polyfill __TAURI_INTERNALS__ so @tauri-apps/api imports also work in dev mode.
// This MUST run before any @tauri-apps/api module loads.
if (isDevMode) {
  const callbackStore: Record<number, Function> = {};
  let cbId = 0;
  (window as any).__TAURI_INTERNALS__ = {
    invoke: (cmd: string, args?: Record<string, unknown>) => invokeViaProxy(cmd, args ?? {}),
    transformCallback: (callback: Function, once?: boolean) => {
      const id = ++cbId;
      callbackStore[id] = (...args: unknown[]) => {
        callback(...args);
        if (once) delete callbackStore[id];
      };
      (window as any)[\`_\${id}\`] = callbackStore[id];
      return id;
    },
    convertFileSrc: (filePath: string, _protocol?: string) => {
      // In dev mode, route through the Vite dev server's local asset middleware
      return \`/__local_asset__/\${encodeURIComponent(filePath)}\`;
    },
    metadata: {
      currentWindow: { label: "main" },
      currentWebview: { label: "main" },
    },
  };
}

// ── Public API ──

/**
 * Call a backend command. Auto-routes to Tauri (prod) or dev proxy (dev).
 */
export function invoke<T = unknown>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  // Production Tauri — call __TAURI_INTERNALS__ directly
  if (isTauri) {
    return (window as any).__TAURI_INTERNALS__.invoke(command, camelCaseArgs(args)) as Promise<T>;
  }

  // Dev mode — route through Raincast host via postMessage
  if (isDevMode) {
    return invokeViaProxy<T>(command, args);
  }

  // Neither prod nor dev — standalone browser (shouldn't happen)
  return Promise.reject(new Error(\`[bridge] No backend available for: \${command}\`));
}

/**
 * Listen for events from the backend. Returns an unlisten function.
 */
export function listen(
  event: string,
  callback: (payload: unknown) => void,
): (() => void) | Promise<() => void> {
  // Production Tauri — use __TAURI_INTERNALS__ directly
  if (isTauri) {
    const ti = (window as any).__TAURI_INTERNALS__;
    const handler = ti.transformCallback((e: any) => { callback(e.payload); });
    return ti.invoke("plugin:event|listen", { event, target: { kind: "Any" }, handler })
      .then((eventId: number) => () => {
        ti.invoke("plugin:event|unlisten", { event, eventId });
      });
  }

  // Dev mode — subscribe via postMessage relay
  if (isDevMode) {
    if (!eventListeners.has(event)) eventListeners.set(event, new Set());
    const cbs = eventListeners.get(event)!;
    cbs.add(callback);

    // Tell the Raincast host to start forwarding this event
    if (cbs.size === 1) {
      window.parent.postMessage({ type: "proxy-listen", event }, "*");
    }

    return () => {
      cbs.delete(callback);
      if (cbs.size === 0) {
        eventListeners.delete(event);
        window.parent.postMessage({ type: "proxy-unlisten", event }, "*");
      }
    };
  }

  return () => {};
}

/**
 * Check if the backend is available and responding.
 */
export async function ping(): Promise<{ connected: boolean; mode: string; latencyMs: number }> {
  if (isTauri) {
    return { connected: true, mode: "tauri", latencyMs: 0 };
  }
  if (isDevMode) {
    try {
      const t0 = performance.now();
      await invokeViaProxy("__ping__", {});
      return { connected: true, mode: "dev-proxy", latencyMs: Math.round(performance.now() - t0) };
    } catch {
      return { connected: false, mode: "dev-proxy", latencyMs: 0 };
    }
  }
  return { connected: false, mode: "none", latencyMs: 0 };
}

// ── Runtime error capture (dev mode only) ──
// Forwards console errors and uncaught exceptions to the Raincast host
// so the AI self-heal loop can see runtime issues, not just tsc output.

if (isDevMode) {
  const post = (type: string, payload: unknown) => {
    try { window.parent.postMessage({ type, payload }, "*"); } catch {}
  };

  const origError = console.error;
  const origWarn = console.warn;

  console.error = (...args: unknown[]) => {
    origError.apply(console, args);
    post("runtime-console", { level: "error", message: args.map(String).join(" ") });
  };
  console.warn = (...args: unknown[]) => {
    origWarn.apply(console, args);
    post("runtime-console", { level: "warn", message: args.map(String).join(" ") });
  };

  window.addEventListener("error", (e) => {
    post("runtime-console", {
      level: "error",
      message: \`\${e.message} at \${e.filename || "unknown"}:\${e.lineno || 0}:\${e.colno || 0}\`,
    });
  });
  window.addEventListener("unhandledrejection", (e) => {
    post("runtime-console", {
      level: "error",
      message: \`Unhandled rejection: \${e.reason instanceof Error ? e.reason.message : String(e.reason)}\`,
    });
  });
}
`,
};

/**
 * Standalone runtime error capture — runs as a side-effect import from main.tsx.
 * Separate from bridge.ts so it fires even if the app never uses invoke/listen.
 */
const RUNTIME_CAPTURE: ScaffoldFile = {
  path: "src/lib/runtimeCapture.ts",
  content: `/**
 * Captures runtime console errors/warnings and forwards them to the Raincast host
 * via postMessage so the error badge + AI self-heal loop can see them.
 *
 * This file is imported from main.tsx as a side-effect import.
 * It runs only in dev-preview mode (iframe inside Raincast).
 */

const isPreview = window.parent !== window && !(window as any).__TAURI_INTERNALS__;

if (isPreview) {
  const post = (level: string, message: string) => {
    try { window.parent.postMessage({ type: "runtime-console", payload: { level, message } }, "*"); } catch {}
  };

  // ── Override console.error / console.warn ──
  const origError = console.error;
  const origWarn = console.warn;

  console.error = (...args: unknown[]) => {
    origError.apply(console, args);
    post("error", args.map(String).join(" "));
  };
  console.warn = (...args: unknown[]) => {
    origWarn.apply(console, args);
    post("warn", args.map(String).join(" "));
  };

  // ── Uncaught errors ──
  window.addEventListener("error", (e) => {
    post("error", \`\${e.message} at \${e.filename || "unknown"}:\${e.lineno || 0}:\${e.colno || 0}\`);
  });
  window.addEventListener("unhandledrejection", (e) => {
    post("error", \`Unhandled rejection: \${e.reason instanceof Error ? e.reason.message : String(e.reason)}\`);
  });

  // ── Override fetch to catch HTTP errors ──
  // Browser "Failed to load resource" errors are engine-level and invisible to JS.
  // By wrapping fetch, we can report failed HTTP requests ourselves.
  const origFetch = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    try {
      const response = await origFetch(...args);
      if (!response.ok) {
        const url = typeof args[0] === "string" ? args[0] : args[0] instanceof Request ? args[0].url : String(args[0]);
        let host: string;
        try { host = new URL(url, location.href).hostname; } catch { host = url; }
        post("error", \`HTTP \${response.status} \${response.statusText} — \${host}\`);
      }
      return response;
    } catch (err) {
      const url = typeof args[0] === "string" ? args[0] : args[0] instanceof Request ? args[0].url : String(args[0]);
      let host: string;
      try { host = new URL(url, location.href).hostname; } catch { host = url; }
      post("error", \`Network error: \${err instanceof Error ? err.message : String(err)} — \${host}\`);
      throw err;
    }
  };
}
`,
};

const COMMANDS_UTIL: ScaffoldFile = {
  path: "src/lib/commands.ts",
  content: `/**
 * Typed wrappers around Tauri bridge commands.
 * These mirror the commands available in the Raincast Rust backend.
 *
 * Usage:
 *   import { readTextFile, writeTextFile } from "./lib/commands";
 *   const content = await readTextFile("/tmp/notes.txt");
 */

import { invoke } from "./bridge";

// ── File System ──

export function readTextFile(path: string): Promise<string> {
  return invoke<string>("bridge_read_file", { path });
}

export function writeTextFile(path: string, content: string): Promise<void> {
  return invoke<void>("bridge_write_file", { path, content });
}

export function listDir(path: string): Promise<Array<{ name: string; isDir: boolean }>> {
  return invoke<Array<{ name: string; isDir: boolean }>>("bridge_list_dir", { path });
}

// ── Clipboard ──

export function readClipboard(): Promise<string> {
  return invoke<string>("bridge_clipboard_read");
}

export function writeClipboard(text: string): Promise<void> {
  return invoke<void>("bridge_clipboard_write", { text });
}

// ── App Info ──

export function getAppInfo(): Promise<{ name: string; version: string }> {
  return invoke<{ name: string; version: string }>("bridge_app_info");
}

// ── External URLs ──

/**
 * Open a URL in the user's default browser.
 * Works in both Tauri production and dev-proxy mode.
 * Use this instead of iframes for external sites — most sites block iframe embedding.
 */
export function openExternal(url: string): void {
  invoke("plugin:opener|open_url", { url }).catch(() => {
    // Fallback: window.open (works in most environments)
    window.open(url, "_blank");
  });
}

// ── Shell / Script Execution ──

export interface RunCommandResult {
  exit_code: number;
  stdout: string;
  stderr: string;
}

/**
 * Run a shell command or script and return its output.
 * Use this for system commands, AppleScript, shell scripts, etc.
 *
 * Examples:
 *   // Run a shell command
 *   const result = await runCommand("ls", ["-la", "/tmp"]);
 *
 *   // Run AppleScript (macOS)
 *   const result = await runCommand("osascript", ["-e", 'tell application "System Events" to get name of every process']);
 *
 *   // Run with a working directory
 *   const result = await runCommand("python3", ["script.py"], "/path/to/dir");
 */
export function runCommand(
  program: string,
  args: string[] = [],
  cwd?: string,
): Promise<RunCommandResult> {
  return invoke<RunCommandResult>("bridge_run_command", { program, args, cwd: cwd ?? null });
}
`,
};

const SKELETON_COMPONENT: ScaffoldFile = {
  path: "src/components/Skeleton.tsx",
  content: `/**
 * Skeleton loading placeholder — shows a shimmering block while content loads.
 * Use to prevent blank/frozen UI while waiting for backend data.
 *
 * Usage:
 *   <Skeleton className="h-4 w-48" />              // text line
 *   <Skeleton className="h-32 w-full rounded-lg" /> // card
 *   <Skeleton className="h-8 w-8 rounded-full" />   // avatar
 */

import { cn } from "../lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-white/[0.06]",
        className
      )}
    />
  );
}

/**
 * Wraps async data loading with loading/error/ready states.
 * Shows skeleton while loading, error on failure, children when ready.
 *
 * Usage:
 *   <AsyncBlock loading={isLoading} error={err} skeleton={<Skeleton className="h-32 w-full" />}>
 *     <RealContent data={data} />
 *   </AsyncBlock>
 */
export function AsyncBlock({
  loading,
  error,
  skeleton,
  children,
}: {
  loading: boolean;
  error?: string | null;
  skeleton: React.ReactNode;
  children: React.ReactNode;
}) {
  if (loading) return <>{skeleton}</>;
  if (error) return (
    <div className="flex items-center justify-center p-4 text-sm text-red-400/80 select-none">
      {error}
    </div>
  );
  return <>{children}</>;
}
`,
};

// ── Tier assembly ──────────────────────────────────────────────────

const BASE_PROTECTED = [
  "package.json",
  "tsconfig.json",
  "vite.config.ts",
  "index.html",
  "src/main.tsx",
  "src/vite-env.d.ts",
  "src-tauri/tauri.conf.json",
];

export { type LayoutArchetype } from "./templates";

/**
 * Build a scaffold for the given tier, optionally shaped by a layout archetype.
 *
 * The tier determines what tools/deps are available (Tailwind, Router, Tauri).
 * The archetype determines the layout skeleton (dashboard, editor, chat, etc.).
 * Archetypes are applied to standard/interactive/system tiers only.
 */
const EXPORT_RULES = `
EXPORTS & TYPES (CRITICAL — the #1 cause of build failures):
- EVERY type, interface, constant, enum, and function in types.ts MUST have the \`export\` keyword. No exceptions.
- Hooks MUST be exported: \`export function useXxx()\`. Components: \`export default function ComponentName()\`.
- Give explicit TypeScript types to ALL function parameters. Never use implicit \`any\`.
- Before finishing EACH file, verify: every name that another file imports is actually exported.`;

export function getScaffold(tier: ScaffoldTier, archetype?: LayoutArchetype): Scaffold {
  const base = getBaseScaffold(tier);

  // Archetypes only apply to tiers with Tailwind
  if (!archetype || tier === "simple") {
    return { ...base, promptContext: base.promptContext + EXPORT_RULES };
  }

  const template = getLayoutTemplate(archetype);

  // Replace App.tsx with the archetype's shell
  const appFile: ScaffoldFile = { path: "src/App.tsx", content: template.appShell };
  const files = base.files
    .filter((f) => f.path !== "src/App.tsx")
    .concat([appFile, ...template.components.map((c) => ({ path: c.path, content: c.content }))]);

  // Append archetype CSS additions to index.css
  if (template.cssAdditions) {
    const cssIdx = files.findIndex((f) => f.path === "src/index.css");
    if (cssIdx !== -1) {
      files[cssIdx] = {
        path: "src/index.css",
        content: files[cssIdx].content + "\n" + template.cssAdditions,
      };
    }
  }

  // Extend protected files with archetype components
  const archetypeProtected = template.components.map((c) => c.path);

  return {
    ...base,
    name: `${base.name} (${template.name})`,
    description: `${base.description} Layout: ${template.description}.`,
    files,
    protectedFiles: [...base.protectedFiles, ...archetypeProtected],
    promptContext: `${base.promptContext}

LAYOUT ARCHETYPE: ${template.name}
${template.promptContext}

${template.layoutRules}
${EXPORT_RULES}`,
  };
}

function getBaseScaffold(tier: ScaffoldTier): Scaffold {
  switch (tier) {
    case "simple":
      return {
        tier,
        name: "Simple",
        description: "Pure React + Vite + TypeScript. No CSS framework.",
        files: [
          SIMPLE_PKG, TSCONFIG, VITE_CONFIG, INDEX_HTML, VITE_ENV,
          MAIN_TSX, HELLO_APP, SIMPLE_CSS, RUNTIME_CAPTURE,
        ],
        protectedFiles: [...BASE_PROTECTED, "src/lib/runtimeCapture.ts"],
        promptContext: `The project is scaffolded with React 19, Vite 6, and TypeScript 5.7.
Available files you should NOT regenerate (they already exist and work):
- package.json (react, react-dom, vite, typescript)
- tsconfig.json, vite.config.ts, index.html, src/main.tsx, src/vite-env.d.ts

You MUST generate:
- src/App.tsx — the main app component (replace the placeholder)
- src/index.css — app styles (plain CSS, no framework)
- src/components/*.tsx — any components your app needs
- src/types.ts — shared types (if needed)

Use plain CSS or inline styles. Import React only if you use class components.
All components should be function components with TypeScript types.`,
      };

    case "standard":
      return {
        tier,
        name: "Standard",
        description: "React + Tailwind CSS + utility hooks. Most common choice.",
        files: [
          STANDARD_PKG, TSCONFIG, VITE_CONFIG, INDEX_HTML, VITE_ENV,
          MAIN_TSX, TAILWIND_APP, TAILWIND_CSS,
          TAILWIND_CONFIG, POSTCSS_CONFIG,
          CN_UTIL, USE_LOCAL_STORAGE, USE_DRAG,
          SKELETON_COMPONENT, RUNTIME_CAPTURE,
        ],
        protectedFiles: [
          ...BASE_PROTECTED,
          "tailwind.config.js",
          "postcss.config.js",
          "src/lib/cn.ts",
          "src/hooks/useLocalStorage.ts",
          "src/hooks/useDrag.ts",
          "src/components/Skeleton.tsx",
          "src/lib/runtimeCapture.ts",
        ],
        promptContext: `The project is scaffolded with React 19, Vite 6, TypeScript 5.7, and Tailwind CSS 3.4.
Available deps: react, react-dom, clsx, lucide-react, recharts, @tauri-apps/api, tailwindcss.

Available utilities you can import (already exist, do NOT regenerate):
These files live at the listed project paths. Adjust the relative import based on YOUR file's location:
  - src/lib/cn.ts → from src/App.tsx: "./lib/cn", from src/components/Foo.tsx: "../lib/cn"
  - src/hooks/useLocalStorage.ts → from src/App.tsx: "./hooks/useLocalStorage", from src/components/Foo.tsx: "../hooks/useLocalStorage"
  - src/hooks/useDrag.ts → from src/App.tsx: "./hooks/useDrag", from src/components/Foo.tsx: "../hooks/useDrag"
  - lucide-react → icons: import { SomeIcon } from "lucide-react"
  - recharts → charts & data visualization (ALWAYS use recharts for charts, never hardcode SVG/CSS charts)
  - src/components/Skeleton.tsx → Skeleton (shimmer placeholder) and AsyncBlock (loading/error wrapper)
    Import from src/App.tsx: "./components/Skeleton", from src/components/Foo.tsx: "./Skeleton"

SKELETON / ASYNC LOADING:
- Use Skeleton and AsyncBlock from the scaffold when fetching data via fetch().
- Show skeleton placeholders that match the shape of real content while loading. Never show blank or frozen UI.

WINDOW DRAGGING (CRITICAL — do NOT use CSS -webkit-app-region):
- useDrag hook lives at src/hooks/useDrag.ts — adjust relative import for YOUR file's location (e.g., from src/components/Foo.tsx use "../hooks/useDrag").
- Attach onMouseDown={onDrag} to draggable areas (sidebar, header, toolbar).
- Add data-no-drag attribute to interactive elements inside draggable areas (buttons, inputs, links).
- Do NOT use CSS classes "drag-region" or "no-drag" — they don't work in Tauri 2. Use useDrag() + data-no-drag instead.
- Example: const onDrag = useDrag(); <aside onMouseDown={onDrag}><button data-no-drag>Click</button></aside>

TAURI SYSTEM ACCESS:
- @tauri-apps/api is installed. Use it ONLY for: convertFileSrc (images), path (homeDir, etc.), window (getCurrentWindow).
- Do NOT import invoke or listen from @tauri-apps/api — those are only available in the system tier via the bridge.
- Do NOT import from @tauri-apps/plugin-* packages — they are NOT installed.
- For file picker dialogs, use browser <input type="file"> or <input type="file" webkitdirectory> — NOT @tauri-apps/plugin-dialog.

EXTERNAL LINKS & WEB PAGE RENDERING:
- NEVER embed external websites in iframes — most sites block it (CSP, X-Frame-Options).
- NEVER fetch raw HTML and display as text or inject via dangerouslySetInnerHTML — this does not render pages.
- To render external web pages (browsers, URL viewers): use Tauri's WebviewWindow to open a native webview: import { WebviewWindow } from "@tauri-apps/api/webviewWindow"; new WebviewWindow("label", { url: "https://example.com", title: "Page Title", width: 1200, height: 800 });
- For simple external links: use openExternal from commands.ts (system tier) or window.open(url, "_blank") (other tiers).

Files you should NOT regenerate (they already exist and work):
  package.json, tsconfig.json, vite.config.ts, index.html, src/main.tsx,
  src/vite-env.d.ts, tailwind.config.js, postcss.config.js,
  src/lib/cn.ts, src/hooks/useLocalStorage.ts, src/hooks/useDrag.ts,
  src/components/Skeleton.tsx

You MUST generate:
- src/App.tsx — the main app component (replace the placeholder)
- src/components/*.tsx — app components
- Optionally: src/types.ts, additional hooks in src/hooks/

Use Tailwind CSS classes for ALL styling. Do NOT use inline styles or CSS modules.
Use lucide-react for icons. Use cn() for conditional classes.`,
      };

    case "interactive":
      return {
        tier,
        name: "Interactive",
        description: "Standard + React Router for multi-page apps.",
        files: [
          INTERACTIVE_PKG, TSCONFIG, VITE_CONFIG, INDEX_HTML, VITE_ENV,
          ROUTER_MAIN, ROUTER_APP, TAILWIND_CSS,
          TAILWIND_CONFIG, POSTCSS_CONFIG,
          CN_UTIL, USE_LOCAL_STORAGE, USE_DRAG,
          SKELETON_COMPONENT, LAYOUT_COMPONENT, HOME_PAGE,
        ],
        protectedFiles: [
          ...BASE_PROTECTED,
          "tailwind.config.js",
          "postcss.config.js",
          "src/lib/cn.ts",
          "src/hooks/useLocalStorage.ts",
          "src/hooks/useDrag.ts",
          "src/components/Skeleton.tsx",
        ],
        promptContext: `The project is scaffolded with React 19, Vite 6, TypeScript 5.7, Tailwind CSS 3.4, and React Router 6.
Available deps: react, react-dom, react-router-dom, clsx, lucide-react, recharts, @tauri-apps/api, tailwindcss.

Available utilities (already exist, do NOT regenerate):
These files live at the listed project paths. Adjust the relative import based on YOUR file's location:
  - src/lib/cn.ts → from src/App.tsx: "./lib/cn", from src/components/Foo.tsx: "../lib/cn", from src/pages/Foo.tsx: "../lib/cn"
  - src/hooks/useLocalStorage.ts → from src/App.tsx: "./hooks/useLocalStorage", from src/components/Foo.tsx: "../hooks/useLocalStorage"
  - src/hooks/useDrag.ts → from src/App.tsx: "./hooks/useDrag", from src/components/Foo.tsx: "../hooks/useDrag"
  - lucide-react → icons: import { SomeIcon } from "lucide-react"
  - recharts → charts & data visualization (ALWAYS use recharts, never hardcode SVG/CSS charts)
  - @tauri-apps/api/core → call Rust backend commands: import { invoke } from "@tauri-apps/api/core"

WINDOW DRAGGING (CRITICAL — do NOT use CSS -webkit-app-region):
- useDrag hook lives at src/hooks/useDrag.ts — adjust relative import for YOUR file's location (e.g., from src/components/Foo.tsx use "../hooks/useDrag").
- Attach onMouseDown={onDrag} to draggable areas (sidebar, header, toolbar).
- Add data-no-drag attribute to interactive elements inside draggable areas (buttons, inputs, links).
- Do NOT use CSS classes "drag-region" or "no-drag". Use useDrag() + data-no-drag instead.

TAURI SYSTEM ACCESS:
- @tauri-apps/api is installed and provides: core (invoke), path, window, event.
- Do NOT import from @tauri-apps/plugin-* packages — they are NOT installed.
- For file picker dialogs, use browser <input type="file"> — NOT @tauri-apps/plugin-dialog.
- For file system operations, use invoke() to call custom Rust commands — NOT @tauri-apps/plugin-fs.
- Wrap all invoke() calls in try/catch so the app works gracefully in dev preview.

EXTERNAL LINKS & WEB PAGE RENDERING:
- NEVER embed external websites in iframes — most sites block it (CSP, X-Frame-Options).
- NEVER fetch raw HTML and display as text or inject via dangerouslySetInnerHTML — this does not render pages.
- To render external web pages (browsers, URL viewers): use Tauri's WebviewWindow to open a native webview: import { WebviewWindow } from "@tauri-apps/api/webviewWindow"; new WebviewWindow("label", { url: "https://example.com", title: "Page Title", width: 1200, height: 800 });
- For simple external links: use openExternal from commands.ts (system tier) or window.open(url, "_blank") (other tiers).

Routing is pre-configured:
- src/main.tsx wraps App in <BrowserRouter>
- src/App.tsx uses <Routes> and <Route>
- src/components/Layout.tsx provides a shared layout with <Outlet />
- src/pages/Home.tsx is the index page

Files you should NOT regenerate:
  package.json, tsconfig.json, vite.config.ts, index.html,
  src/vite-env.d.ts, tailwind.config.js, postcss.config.js,
  src/lib/cn.ts, src/hooks/useLocalStorage.ts, src/hooks/useDrag.ts

You SHOULD generate/modify:
- src/App.tsx — add routes (keep the <Routes>/<Route> pattern)
- src/components/Layout.tsx — customize the layout
- src/pages/*.tsx — add pages
- src/components/*.tsx — add components

Use React Router's <Link>, useNavigate(), useParams() for navigation.
Use Tailwind CSS for styling. Use cn() for conditional classes.`,
      };

    case "system":
      return {
        tier,
        name: "System",
        description: "Interactive + Tauri bridge for OS-integrated apps.",
        files: [
          SYSTEM_PKG, TSCONFIG, VITE_CONFIG, INDEX_HTML, VITE_ENV,
          ROUTER_MAIN, ROUTER_APP, TAILWIND_CSS,
          TAILWIND_CONFIG, POSTCSS_CONFIG,
          CN_UTIL, USE_LOCAL_STORAGE, USE_DRAG,
          SKELETON_COMPONENT, LAYOUT_COMPONENT, HOME_PAGE,
          BRIDGE, COMMANDS_UTIL, RUNTIME_CAPTURE,
        ],
        protectedFiles: [
          ...BASE_PROTECTED,
          "tailwind.config.js",
          "postcss.config.js",
          "src/lib/cn.ts",
          "src/hooks/useLocalStorage.ts",
          "src/hooks/useDrag.ts",
          "src/components/Skeleton.tsx",
          "src/lib/bridge.ts",
          "src/lib/commands.ts",
          "src/lib/runtimeCapture.ts",
        ],
        promptContext: `The project is scaffolded with React 19, Vite 6, TypeScript 5.7, Tailwind CSS 3.4, React Router 6, and a Tauri bridge.
Available deps: react, react-dom, react-router-dom, clsx, lucide-react, recharts, @tauri-apps/api, tailwindcss.

Available utilities (already exist, do NOT regenerate):
These files live at the listed project paths. Adjust the relative import based on YOUR file's location:
  - src/lib/cn.ts → from src/App.tsx: "./lib/cn", from src/components/Foo.tsx: "../lib/cn"
  - src/hooks/useLocalStorage.ts → from src/App.tsx: "./hooks/useLocalStorage", from src/components/Foo.tsx: "../hooks/useLocalStorage"
  - src/hooks/useDrag.ts → from src/App.tsx: "./hooks/useDrag", from src/components/Foo.tsx: "../hooks/useDrag"
  - lucide-react → icons: import { SomeIcon } from "lucide-react"
  - recharts → charts & data visualization (ALWAYS use recharts, never hardcode SVG/CSS charts)

Tauri bridge (for system access via the Raincast host):
  - src/lib/bridge.ts → from src/App.tsx: "./lib/bridge", from src/components/Foo.tsx: "../lib/bridge"
  - src/lib/commands.ts → from src/App.tsx: "./lib/commands", from src/components/Foo.tsx: "../lib/commands"
  - bridge exports: invoke, listen
  - commands exports: readTextFile, writeTextFile, listDir, readClipboard, writeClipboard, openExternal, runCommand

WINDOW DRAGGING (CRITICAL — do NOT use CSS -webkit-app-region):
- useDrag hook lives at src/hooks/useDrag.ts — adjust relative import for YOUR file's location (e.g., from src/components/Foo.tsx use "../hooks/useDrag").
- Attach onMouseDown={onDrag} to draggable areas (sidebar, header, toolbar).
- Add data-no-drag attribute to interactive elements inside draggable areas (buttons, inputs, links).
- Do NOT use CSS classes "drag-region" or "no-drag". Use useDrag() + data-no-drag instead.

AVAILABLE CAPABILITIES (what the backend CAN do):
- Read/write files anywhere on the filesystem (readTextFile, writeTextFile, listDir)
- Read/write system clipboard (readClipboard, writeClipboard)
- Run shell commands, scripts, and AppleScript (runCommand) — execute any CLI tool or osascript
  Example: const result = await runCommand("osascript", ["-e", 'tell app "System Events" to get name of every process']);
  Example: const result = await runCommand("ls", ["-la", homePath]);
- Open URLs in the default browser (openExternal)
- Get app info (getAppInfo)
- Fetch data from HTTP APIs (use standard fetch() — no backend command needed)
- Use Tauri WebviewWindow to open native web views for external pages

NOT AVAILABLE (do NOT attempt these — they will fail):
- Direct Node.js APIs (fs, path, child_process, os) — use bridge commands instead
- @tauri-apps/plugin-* packages — they are NOT installed
- Controlling other app GUIs via accessibility APIs or input simulation
- Reading screen content or pixels from other applications
- Native system notifications — use in-app toast UI instead
- System tray / menu bar icons

TAURI SYSTEM ACCESS (CRITICAL):
- ALWAYS import invoke and listen from "./lib/bridge" (or "../lib/bridge" depending on file location) — NEVER from "@tauri-apps/api/core" or "@tauri-apps/api/event". The bridge handles both production Tauri and dev preview automatically.
- @tauri-apps/api is installed but ONLY use it for: convertFileSrc (images), path (homeDir, etc.), window (getCurrentWindow). For invoke/listen, ALWAYS use bridge.ts.
- Do NOT import from @tauri-apps/plugin-* packages — they are NOT installed.
- For file picker dialogs, use browser <input type="file"> — NOT @tauri-apps/plugin-dialog.
- For file system, clipboard, or OS operations, use the bridge utilities above (./lib/bridge, ./lib/commands).
- Wrap all invoke() calls in try/catch so the app works gracefully in dev preview.
- Use onBackendReady() from bridge.ts to defer data loading until the backend is available: import { onBackendReady } from "./lib/bridge"; useEffect(() => onBackendReady(() => scanFolder()), []);

SKELETON / ASYNC LOADING (CRITICAL — keep UI responsive):
- src/components/Skeleton.tsx provides Skeleton (shimmer placeholder) and AsyncBlock (loading/error wrapper).
  Import: from src/App.tsx: "./components/Skeleton", from src/components/Foo.tsx: "./Skeleton"
- EVERY component that calls invoke() or fetch() MUST show Skeleton placeholders while loading.
- NEVER show a blank, empty, or frozen UI while waiting for data. The layout must remain visible with skeleton shapes matching the expected content.
- For click-triggered data (user opens a file, selects a category): immediately show skeletons in the target area, then swap to real content.
- Use AsyncBlock for simple cases: <AsyncBlock loading={loading} error={error} skeleton={<Skeleton className="h-10 w-full" />}>{content}</AsyncBlock>

EXTERNAL LINKS (CRITICAL — no iframes for external sites):
- NEVER embed external websites in iframes — most sites block it (CSP, X-Frame-Options) and it will show a blank page.
- For external links, use openExternal from commands.ts: import { openExternal } from "./lib/commands"; openExternal("https://example.com");
- If the app needs external content (search results, feeds, etc.), fetch data via API and render natively — do NOT embed the page.

Routing is pre-configured (same as interactive tier).

Files you should NOT regenerate:
  package.json, tsconfig.json, vite.config.ts, index.html,
  src/vite-env.d.ts, tailwind.config.js, postcss.config.js,
  src/lib/cn.ts, src/hooks/useLocalStorage.ts, src/hooks/useDrag.ts,
  src/components/Skeleton.tsx, src/lib/bridge.ts, src/lib/commands.ts

Use the bridge for any file system, clipboard, or OS operations.
Use Tailwind CSS for styling. Use React Router for navigation.`,
      };
  }
}
