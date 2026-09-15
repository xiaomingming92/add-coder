/*
 * 贡献者墙生成器校验（声明式真源 → 生成 → 幂等）
 *
 * 门控：无外部依赖（不联网、不读 git），随 `npm test` 跑；
 * 失败即「生成区与 docs/contributors.toml 不一致」→ 修复命令：npm run contributors
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readManifest, renderFile, targets, visiblePersons } from "../scripts/gen-contributors.js";

describe("贡献者墙生成器", () => {
  const manifest = readManifest();
  const persons = visiblePersons(manifest);

  it("生成区与真源一致（docs/contributors.toml 为唯一事实源）", () => {
    for (const target of targets()) {
      const current = readFileSync(target.file, "utf-8");
      expect(renderFile(target, persons, current), `${target.file} 生成区与真源不一致，跑 npm run contributors`).toBe(
        current,
      );
    }
  });

  it("真源字段完整，login 唯一且不与人头数冲突", () => {
    const logins = persons.map((p) => p.login);
    expect(new Set(logins).size, "login 重复").toBe(logins.length);
    for (const p of persons) {
      expect(p.login, "login 不能为空").toBeTruthy();
      expect(p.role, `${p.login} 缺少 role`).toBeTruthy();
      expect(p.cell, `${p.login} 缺少 cell`).toBeTruthy();
      expect(p.summary, `${p.login} 缺少 summary`).toBeTruthy();
    }
  });

  it("墙上的名额与真源可见人数一致（你的位置 格不计入）", () => {
    const wall = renderFile(targets()[0], persons, readFileSync(targets()[0].file, "utf-8"));
    const cells = wall.match(/@[A-Za-z0-9-]+<\/b>/g) ?? [];
    expect(cells.length).toBe(persons.length);
  });
});
