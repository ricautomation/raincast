import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// @ts-expect-error process is a nodejs global
const isDev = process.env.NODE_ENV !== "production" && !process.env.TAURI_ENV_TARGET_TRIPLE;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [tailwindcss(), react()],

  // In dev mode, resolve monorepo packages from source for HMR.
  // In production (CI/tauri build), use the built dist/ via package.json exports.
  resolve: isDev
    ? {
        alias: [
          { find: "@rain/editkit/core", replacement: path.resolve(__dirname, "../packages/editkit/src/core.ts") },
          { find: "@rain/editkit/browser", replacement: path.resolve(__dirname, "../packages/editkit/src/browser.ts") },
          { find: "@rain/editkit/prompts", replacement: path.resolve(__dirname, "../packages/editkit/src/prompts.ts") },
          { find: "@rain/editkit", replacement: path.resolve(__dirname, "../packages/editkit/src/index.ts") },
          { find: "@rain/webtools", replacement: path.resolve(__dirname, "../packages/webtools/src/index.ts") },
        ],
      }
    : {},

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
