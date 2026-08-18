import { describe, expect, it } from "vitest";
import { extractSpecRef } from "../templates/core/scripts/mcp-server/shared/dps-spec-ref.js";

describe("extractSpecRef 五端适配器支持", () => {
  const cases = [
    ["qoder", "qoder", "foo-bar"],
    ["claude", "claude", "foo-bar-v1"],
    ["add", "add", "foo-bar"],
    ["vscode", "vscode", "foo-bar-v2"],
    ["codex", "codex", "add-coder-packaging-sync"],
    ["trae", "trae", "foo-bar"],
  ] as const;

  for (const [name, magicDir, specDir] of cases) {
    it(`${name}: 解析 Spec 引用（含 -vN 后缀 spec 目录）`, () => {
      const plan = `- Spec: \`.${magicDir}/specs/${specDir}/spec.md\``;
      expect(extractSpecRef(plan)).toEqual({ magicDir, specDir });
    });
  }

  it("真实 codex plan 头可解析", () => {
    const plan =
      "# x\n- **关联文档**:\n  - Spec: `.codex/specs/add-coder-codex-native-adapter-runtime-closure/spec.md`";
    expect(extractSpecRef(plan)?.specDir).toBe(
      "add-coder-codex-native-adapter-runtime-closure",
    );
  });

  it("无 Spec 行返回 null（回退 plan 文件名推导）", () => {
    expect(extractSpecRef("# 标题\n无引用")).toBeNull();
  });
});
