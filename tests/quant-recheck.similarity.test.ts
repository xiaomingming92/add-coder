// 量化复检层合成数据验证（Task 2.1）——直接验证纯函数，不依赖 MCP
// 运行: npx vitest run tests/quant-recheck.similarity.test.ts
import { describe, expect, it } from "vitest";
import { weightedJaccard, rrfScore, ewmaThreshold } from "../templates/core/scripts/mcp-server/tools/gateway/check_doc_similarity.js";

describe("量化复检层合成数据", () => {
  it("区分形似义异、合法模板并观测 EWMA 阈值漂移", () => {
    let pass = 0, fail = 0;
    function check(name: string, cond: boolean, detail = "") {
      if (cond) { pass++; console.log(`✅ ${name}`); }
      else { fail++; console.log(`❌ ${name} ${detail}`); }
    }

// ── 2.1.1 形似义异：锚点齐全但语义偏离 → 相似度低 → WARN_BLOCKED ──
{
  // 合法模板文档：与参照高度重叠
  const ref = new Set(["plan_track", "spec", "tasks", "handoff", "review", "templates", "guard"]);
  const legit = new Set(["plan_track", "spec", "tasks", "handoff", "review", "templates", "guard", "anchor", "禁词"]);
  // 形似义异：锚点(plan_track/templates)齐全，其余词全部替换
  const fake = new Set(["plan_track", "templates", "水军", "刷量", "代写", "拼凑", "外包"]);
  const anchors = new Set(["plan_track", "templates"]);

  const jLegit = weightedJaccard(legit, ref, anchors);
  const jFake = weightedJaccard(fake, ref, anchors);
  console.log(`  legit j=${jLegit.toFixed(3)} fake j=${jFake.toFixed(3)}`);
  check("形似义异 Jaccard 显著低于合法文档", jFake < jLegit - 0.2, `legit=${jLegit} fake=${jFake}`);

  // RRF 融合（合成候选集：形似义异文档与所有 section 均无强匹配——相对排名仍可能靠前）
  const scored = [
    { j: 0.846, t: 0.92 },
    { j: 0.375, t: 0.31 },
    { j: 0.45, t: 0.55 },
  ];
  const rrf = rrfScore(scored);
  console.log(`  rrf=${rrf.toFixed(4)} bestAbs=0.846`);
  check("候选集 RRF 融合产出区分度", rrf > 0.15 && rrf < 0.2, `rrf=${rrf}`);
  // 形似义异 = 全低相似度：bestAbs < MIN_ABS_SIMILARITY(0.5) → 双闸门拦截
  const fakeScored = [
    { j: 0.15, t: 0.12 },
    { j: 0.2, t: 0.18 },
    { j: 0.1, t: 0.08 },
  ];
  const fakeRrf = rrfScore(fakeScored);
  const fakeMatch = Math.max(...fakeScored.map((x) => Math.max(x.j, x.t)));
  console.log(`  形似义异 rrf=${fakeRrf.toFixed(4)} bestMatch=${fakeMatch}`);
  check("形似义异判定 WARN_BLOCKED（绝对闸门：bestMatch < 0.25）", fakeRrf < 0.16 || fakeMatch < 0.25, `rrf=${fakeRrf} match=${fakeMatch}`);
}

// ── 2.1.2 合法模板文档 → PASS ──
{
  const legit = new Set(["plan_track", "spec", "tasks", "handoff", "review", "templates", "guard", "anchor", "禁词", "schema", "轮次"]);
  const ref = new Set(["plan_track", "spec", "tasks", "handoff", "review", "templates", "guard"]);
  const anchors = new Set(["plan_track"]);
  const j = weightedJaccard(legit, ref, anchors);
  const rrf = rrfScore([{ j, t: 0.95 }, { j: j * 0.8, t: 0.7 }, { j: 0.3, t: 0.4 }]);
  console.log(`  合法文档 j=${j.toFixed(3)} rrf=${rrf.toFixed(4)}`);
  check("合法文档 PASS（rrf ≥ 冷启动基线 0.16）", rrf >= 0.16, `rrf=${rrf}`);
}

// ── 2.1.3 override/decide 样本校准 → EWMA 阈值漂移可观测 ──
{
  // 历史全高分（守卫趋严）→ 阈值应上移；注入低分 decide 样本 → 阈值下移
  const historyHigh = Array.from({ length: 12 }, (_, i) => 0.9 + (i % 3) * 0.02);
  const tHigh = ewmaThreshold(historyHigh);
  const historyLow = [...historyHigh.slice(0, 10), 0.35, 0.3];  // 注入 2 条低分（人类 decide: overrule PASS）
  const tLow = ewmaThreshold(historyLow);
  console.log(`  高历史 lower=${tHigh.lower.toFixed(4)}  注入低分后 lower=${tLow.lower.toFixed(4)}`);
  check("EWMA 阈值随历史分数漂移", Math.abs(tLow.lower - tHigh.lower) > 0.05, `Δ=${Math.abs(tLow.lower - tHigh.lower).toFixed(4)}`);

  // 冷启动基线
  const tCold = ewmaThreshold([0.9]);
  check("冷启动用保守基线", tCold.lower === 0.16, `lower=${tCold.lower}`);
}

    console.log(`\n==== 结果: PASS=${pass} FAIL=${fail} ====`);
    expect(fail).toBe(0);
    expect(pass).toBe(6);
  });
});
