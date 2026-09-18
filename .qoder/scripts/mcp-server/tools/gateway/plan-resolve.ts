/*
 * Plan ↔ 兄弟制品（add-route / handoff / review）版本配对解析 —— 单一真源
 *
 * 动因（2026-09-18，farm-agent 多 v2 Plan 暴露）：
 *   旧实现按 planKeyword **去掉版本后缀取首个匹配** → 命中日期最早的 v1 add-route；
 *   且 Plan 解析只要求文件名含 "-plan-v" → `...-plan-v2.hitl.md` 提案文件会顶替真正的 Plan。
 *   后果：check_spec_sync 拿旧版路线图的附录比对当前 git diff，报出几十条「未登记」假告警；
 *   check_dps / check_add_route_status / check_add_route_completeness 同样读错文档。
 *   同类问题第三例：git diff 路径被引号+八进制转义（`".codex/plans/...\346\236..."`），
 *   既躲过 magic 前缀豁免、也与附录里的真实中文路径比不中 → 统一走 `-z`（NUL 分隔，永不加引号）。
 *
 * 解析优先级（可否证伪、不静默降级）：
 *   Plan      : 关键词命中且 `-plan-vN.md` **结尾**（`.hitl.md`/devlog/handoff/add-route/review 天然排除）
 *               → 版本号最大；同版本按路径降序（日期新者优先）
 *               兜底：关键词命中、含 "plan"、非兄弟产物的 `.md`
 *   add-route : ① 同目录 + 同基名 + 同版本  ② 同基名最高版本（同版本优先 Plan 所在目录）
 *               ③ 关键词命中最高版本（基名与 Plan 不同时的兼容路径）
 *   版本落后（add-route vN < Plan vM）→ 显式 warning，不静默
 */

export type ArtifactKind = "plan" | "add-route" | "handoff" | "review";

export type ResolveVia =
  | "plan-max-version"
  | "plan-fallback"
  | "paired-same-dir-version"
  | "paired-base-max-version"
  | "keyword-max-version";

export interface ResolvedArtifact {
  /** 相对 plans 目录的路径（POSIX 分隔符） */
  file: string;
  kind: ArtifactKind;
  /** 文件名解析出的版本号；无 `-vN` 后缀 = 0 */
  version: number;
  /** 去掉 `-<kind>-vN.md` 后的基名（review 的 `-review-implementation` 变体一并剥离） */
  base: string;
  /** 所在目录（相对，POSIX；根目录 = ""） */
  dir: string;
  /** 解析依据（可审计，便于区分「配对命中」与「关键词兜底」） */
  via: ResolveVia;
  /** 与 Plan 版本不匹配时的显式告警（null = 无） */
  warning: string | null;
}

export interface ResolveResult {
  plan: ResolvedArtifact | null;
  /** kind 非 plan 时：与已解析 Plan 配对的制品；解析不到 = null */
  artifact: ResolvedArtifact | null;
}

const KIND_SUFFIX: Record<ArtifactKind, RegExp> = {
  plan: /-plan-v(\d+)\.md$/i,
  "add-route": /-add-route-v(\d+)\.md$/i,
  handoff: /-handoff-v(\d+)\.md$/i,
  review: /-review(?:-[a-z0-9-]+)?-v(\d+)\.md$/i,
};

/** Plan 解析必须排除的兄弟产物（提案/日志/契约/下游文档） */
const NON_PLAN_SUFFIX =
  /(\.hitl\.md$)|(-add-route-v\d+\.md$)|(-handoff-v\d+\.md$)|(-review(?:-[a-z0-9-]+)?-v\d+\.md$)|(-contract-v\d+\.md$)|(^devlog-)/i;

export function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

function baseOf(p: string): string {
  const posix = toPosix(p);
  const i = posix.lastIndexOf("/");
  return i < 0 ? posix : posix.slice(i + 1);
}

function dirOf(p: string): string {
  const posix = toPosix(p);
  const i = posix.lastIndexOf("/");
  return i < 0 ? "" : posix.slice(0, i);
}

/** 路径降序（日期新者优先，确定性；避免依赖 readdir 顺序） */
function byPathDesc(a: string, b: string): number {
  return a < b ? 1 : a > b ? -1 : 0;
}

export function parseArtifactName(
  name: string,
  kind: ArtifactKind,
): { base: string; version: number } | null {
  const base = baseOf(name);
  const m = base.match(KIND_SUFFIX[kind]);
  if (!m || m.index === undefined) return null;
  return { base: base.slice(0, m.index), version: parseInt(m[1], 10) };
}

/**
 * `git ... --name-only -z` 输出 → 路径数组。
 * `-z` 下 git **永不**加引号/转义（非 ASCII 路径保持原样），因此这里只需切分。
 * 无 NUL 时按行切分（兼容不支持的旧 git），并清掉 CR。
 */
export function splitGitPathList(stdout: string): string[] {
  const parts = stdout.includes("\u0000") ? stdout.split("\u0000") : stdout.split("\n");
  return parts
    .map((p) => p.replace(/\r$/, ""))
    .filter((p) => p !== "")
    .map(toPosix);
}

/** add-route / review 附录里登记的文件清单（反引号内的路径） */
export function extractAppendixFiles(content: string): string[] {
  return (
    content.match(/`[^`]+\.(ts|tsx|js|jsx|sh|sql|prisma|md|json|yml|yaml|toml)`/g) || []
  ).map((f) => f.replace(/`/g, ""));
}

function build(
  file: string,
  kind: ArtifactKind,
  parsed: { base: string; version: number },
  via: ResolveVia,
  warning: string | null = null,
): ResolvedArtifact {
  return {
    file: toPosix(file),
    kind,
    version: parsed.version,
    base: parsed.base,
    dir: dirOf(file),
    via,
    warning,
  };
}

/** 解析 Plan 文件：版本最高者优先；`.hitl.md` 等兄弟产物不入选 */
export function resolvePlan(
  files: readonly string[],
  keyword: string,
): ResolvedArtifact | null {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return null;
  const pool = files.map(toPosix).filter((f) => f.toLowerCase().includes(kw));

  const versioned = pool
    .map((f) => ({ f, parsed: parseArtifactName(f, "plan") }))
    .filter(
      (e): e is { f: string; parsed: { base: string; version: number } } =>
        e.parsed !== null && !NON_PLAN_SUFFIX.test(baseOf(e.f)),
    )
    .sort((a, b) => b.parsed.version - a.parsed.version || byPathDesc(a.f, b.f));
  if (versioned.length > 0) {
    const { f, parsed } = versioned[0];
    return build(f, "plan", parsed, "plan-max-version");
  }

  // 兜底：无 `-plan-vN` 后缀的 Plan（精简版/历史命名）——仍需排除兄弟产物
  const fallback = pool
    .filter(
      (f) =>
        f.toLowerCase().endsWith(".md") &&
        /plan/i.test(baseOf(f)) &&
        !NON_PLAN_SUFFIX.test(baseOf(f)),
    )
    .sort(byPathDesc);
  if (fallback.length > 0) {
    return build(fallback[0], "plan", { base: baseOf(fallback[0]).replace(/\.md$/i, ""), version: 0 }, "plan-fallback");
  }
  return null;
}

/** 与 Plan 配对的制品：同目录同版本 → 同基名最高版本 → 关键词最高版本 */
export function resolvePairedArtifact(
  files: readonly string[],
  plan: ResolvedArtifact,
  kind: ArtifactKind,
  keyword: string,
): ResolvedArtifact | null {
  const posix = files.map(toPosix);
  const suffix = `-${kind}-v${plan.version}.md`;
  const expected = plan.dir ? `${plan.dir}/${plan.base}${suffix}` : `${plan.base}${suffix}`;
  const exact = posix.find((f) => f.toLowerCase() === expected.toLowerCase());
  if (exact) return build(exact, kind, { base: plan.base, version: plan.version }, "paired-same-dir-version");

  const sameDirScore = (f: string) => (dirOf(f) === plan.dir ? 0 : 1);
  const sameBase = posix
    .map((f) => ({ f, parsed: parseArtifactName(f, kind) }))
    .filter(
      (e): e is { f: string; parsed: { base: string; version: number } } =>
        e.parsed !== null && e.parsed.base.toLowerCase() === plan.base.toLowerCase(),
    )
    .sort(
      (a, b) =>
        b.parsed.version - a.parsed.version ||
        sameDirScore(a.f) - sameDirScore(b.f) ||
        byPathDesc(a.f, b.f),
    );
  if (sameBase.length > 0) {
    const { f, parsed } = sameBase[0];
    return build(f, kind, parsed, "paired-base-max-version", versionWarning(plan, parsed.version, kind));
  }

  const kw = keyword.trim().toLowerCase();
  const byKeyword = posix
    .filter((f) => f.toLowerCase().includes(kw))
    .map((f) => ({ f, parsed: parseArtifactName(f, kind) }))
    .filter(
      (e): e is { f: string; parsed: { base: string; version: number } } => e.parsed !== null,
    )
    .sort((a, b) => b.parsed.version - a.parsed.version || byPathDesc(a.f, b.f));
  if (byKeyword.length > 0) {
    const { f, parsed } = byKeyword[0];
    const warn = versionWarning(plan, parsed.version, kind);
    const base = warn
      ? warn
      : `基名不同：Plan 基名 "${plan.base}"，${kind} 基名 "${parsed.base}"（按关键词兜底命中，请确认对应关系）`;
    return build(f, kind, parsed, "keyword-max-version", base);
  }
  return null;
}

function versionWarning(
  plan: ResolvedArtifact,
  artifactVersion: number,
  kind: ArtifactKind,
): string | null {
  if (plan.version > 0 && artifactVersion < plan.version) {
    return `${kind} v${artifactVersion} 落后于 Plan v${plan.version}（Plan 基名 "${plan.base}"）——补齐对应版本，或确认沿用旧版路线图`;
  }
  return null;
}

/** 工具入口：一次拿到「Plan + 配对制品」 */
export function resolvePlanArtifact(
  files: readonly string[],
  keyword: string,
  kind: ArtifactKind,
): ResolveResult {
  const plan = resolvePlan(files, keyword);
  if (!plan) return { plan: null, artifact: null };
  if (kind === "plan") return { plan, artifact: plan };
  return { plan, artifact: resolvePairedArtifact(files, plan, kind, keyword) };
}

/**
 * 未登记文件的归属分摊：逐个读其它 add-route 的附录，命中即记为「属于该 Plan」。
 * 全部命中即提前返回（不做无谓的全量读取）。顺序由调用方给定（建议新者优先）。
 */
export async function attributeToOtherPlans(
  unmatched: readonly string[],
  otherRoutes: readonly string[],
  readRoute: (rel: string) => Promise<string | null>,
): Promise<{
  /** key = 小写路径（比对用），value = 原名 + 归属 add-route */
  owners: Map<string, { file: string; route: string }>;
  /** 任何 add-route 都未登记的变更文件（原名） */
  unowned: string[];
}> {
  const owners = new Map<string, { file: string; route: string }>();
  let remaining = unmatched.map((f) => ({ key: f.toLowerCase(), file: f }));
  for (const route of otherRoutes) {
    if (remaining.length === 0) break;
    const content = await readRoute(route);
    if (!content) continue;
    const appendix = new Set(extractAppendixFiles(content).map((f) => f.toLowerCase()));
    const stillRemaining: Array<{ key: string; file: string }> = [];
    for (const e of remaining) {
      if (appendix.has(e.key)) owners.set(e.key, { file: e.file, route });
      else stillRemaining.push(e);
    }
    remaining = stillRemaining;
  }
  return { owners, unowned: remaining.map((e) => e.file) };
}
