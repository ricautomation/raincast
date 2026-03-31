import { defineConfig } from "tsup"

export default defineConfig({
  entry: {
    index: "src/index.ts",
    search: "src/search.ts",
    fetch: "src/fetch.ts",
    crawl: "src/crawl.ts",
  },
  format: ["esm"],
  dts: true,
  splitting: true,
  clean: true,
  outDir: "dist",
})
