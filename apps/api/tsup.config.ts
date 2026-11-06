import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node24",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  // Workspace packages ship TypeScript sources, so they must be bundled;
  // everything else (incl. native better-sqlite3) stays an external dependency.
  noExternal: [/^@cronko\//],
  outExtension: () => ({ js: ".mjs" }),
})
