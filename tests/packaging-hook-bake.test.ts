import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

/** 从 adapter 的 hooks.json 中提取所有被引用的 .mjs 产物名 */
function referencedMjs(adapter: string): string[] {
  const f = join(ROOT, "templates/adapters", adapter, "hooks.json");
  if (!existsSync(f)) return [];
  const text = readFileSync(f, "utf8");
  return [...text.matchAll(/([A-Za-z0-9_-]+\.mjs)/g)].map((m) => m[1]);
}

describe("packaging: hook-bake --publish 产物随模板分发", () => {
  for (const adapter of ["codex", "trae"]) {
    it(`${adapter} hooks.json 引用的每个 .mjs 产物在发布模板中存在`, () => {
      const refs = referencedMjs(adapter);
      expect(refs.length).toBeGreaterThan(0);
      for (const ref of refs) {
        expect(
          existsSync(join(ROOT, "templates/adapters", adapter, "hooks", ref)),
          `${adapter} 缺少发布产物: ${ref}`,
        ).toBe(true);
      }
    });
  }

  it("codex 生成态 hooks.json 与源模板一致（.mjs 引用，防双源漂移）", () => {
    const generated = readFileSync(join(ROOT, ".codex/hooks.json"), "utf8");
    const source = readFileSync(join(ROOT, "templates/adapters/codex/hooks.json"), "utf8");
    expect(generated).toBe(source);
  });

  it("prepare 脚本已接入 hook-bake --publish（发布前自动烘焙）", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.prepare).toContain("hook-bake.ts --publish");
  });

  it("src-hash 清单包含 codex 发布产物条目（hash parity）", () => {
    const hash = JSON.parse(
      readFileSync(join(ROOT, "templates/.add-coder-src-hash.json"), "utf8"),
    ) as Record<string, string>;
    const codexMjs = Object.keys(hash).filter(
      (k) => k.startsWith("adapters/codex/hooks/") && k.endsWith(".mjs"),
    );
    expect(codexMjs.length).toBe(14);
  });
});
