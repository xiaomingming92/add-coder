import { defineConfig } from "tsup";

export default defineConfig({
    entry: ["src/cli/index.ts"],
    format: ["esm"],
    dts: true,
    clean: true,
    outDir: "dist",
    target: "node20",
    splitting: false,
    sourcemap: false,
});