import { defineConfig } from "tsup";
import { cpSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// 构建时复制 caijuehub TOML 真源到 dist/caijuehub/（renderer 打包后 __dirname=dist 可解析）
const copyCaijuehubToml = {
    name: "copy-caijuehub-toml",
    setup(build: { onEnd: (fn: () => void) => void }) {
        build.onEnd(() => {
            const src = join(__dirname, "src/caijuehub/dps-scoring-rules.toml");
            const destDir = join(__dirname, "dist/caijuehub");
            mkdirSync(destDir, { recursive: true });
            cpSync(src, join(destDir, "dps-scoring-rules.toml"));
        });
    },
};

export default defineConfig({
    entry: ["src/cli/index.ts"],
    format: ["esm"],
    dts: true,
    tsconfig: "tsconfig.build.json",
    clean: true,
    outDir: "dist",
    target: "node20",
    splitting: false,
    sourcemap: false,
    esbuildPlugins: [copyCaijuehubToml],
});