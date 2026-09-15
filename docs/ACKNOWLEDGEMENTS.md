# 致谢 · Acknowledgements

> 范式不是一个人的独角戏。这份清单记录那些让 ADD 真正跑起来的人——按贡献形态分类，逐项可在仓库里核对。
> 返回：[README.md](../README.md) · [CHANGELOG.md](../CHANGELOG.md) · 想上榜：[CONTRIBUTING.md](../CONTRIBUTING.md)

导航：[贡献者墙](#-贡献者墙) · [核心贡献者](#-核心贡献者) · [问题反馈者](#-问题反馈者) · [如何加入这份清单](#-如何加入这份清单)

---

## 🧱 贡献者墙

<table>
  <tr>
    <td align="center" width="25%">
      <a href="https://github.com/xiaomingming92"><img src="https://github.com/xiaomingming92.png?size=160" width="88" height="88" alt="@xiaomingming92" /></a><br/>
      <sub><b>@xiaomingming92</b></sub><br/>
      <sub>维护者<br/>范式设计 · 发版 · 评审</sub>
    </td>
    <td align="center" width="25%">
      <a href="https://github.com/iopzhu"><img src="https://github.com/iopzhu.png?size=160" width="88" height="88" alt="@iopzhu" /></a><br/>
      <sub><b>@iopzhu</b></sub><br/>
      <sub>记忆轮动<br/>48 文件 / +5877 −33</sub>
    </td>
    <td align="center" width="25%">
      <a href="https://github.com/albertm88"><img src="https://github.com/albertm88.png?size=160" width="88" height="88" alt="@albertm88" /></a><br/>
      <sub><b>@albertm88</b></sub><br/>
      <sub>14 条 issue<br/>全部闭环</sub>
    </td>
    <td align="center" width="25%">
      <a href="../CONTRIBUTING.md"><img src="https://img.shields.io/badge/Issue%20%2F%20PR-welcome-2ea44f?style=flat-square" alt="Issue / PR welcome" /></a><br/>
      <sub><b>你的位置</b></sub><br/>
      <sub><a href="../CONTRIBUTING.md">按贡献指南来</a></sub>
    </td>
  </tr>
</table>

**上榜标准**（真源在贡献指南）：问题反馈（可复现步骤 + 实测日志 + 平台差异）· 代码贡献（被合并的 PR：模板与守卫 / caijuehub 规则 TOML / 记忆与审计链路 / 跨平台修复）· 长期维护（发版 / 评审 / 答疑）——详见 **[CONTRIBUTING.md §贡献者墙](../CONTRIBUTING.md#贡献者墙)**。

> 墙上按**贡献形态**排位，不按资历：一条把边界条件写清的 issue，和一次被合并的 PR 一样重。

---

## 🧩 核心贡献者

### [@iopzhu](https://github.com/iopzhu) — 记忆轮动

**贡献**：记忆闭环的检索层与工具层主体落地（`memory_cache` 分支 [`357b215`](https://github.com/xiaomingming92/add-coder/commit/357b2150286b051ce7944a6fff42ac5eb9d33a7e)「记忆轮动」，2026-08-29，**48 文件 / +5877 −33**）。

| 层次 | 落点 |
|------|------|
| **数据模型** | `prisma/add.prisma` + `templates/core/prisma/add.prisma`（+203/份）、迁移 `20260819071538_add_agent_memory.sql`（+137）与 `20260819080000_add_agent_memory_fts.sql` |
| **domain 层** | `conflicts` / `dedup` / `errors` / `metric-candidate` / `scope` / `secrets`——去重、同 scope 冲突检测、密钥扫描、scope 模型 |
| **检索层** | `retrieval/pipeline`（238 行）/ `fusion` / `reranker` / `query-terms` / `context-builder` / `recall-writer` / `types`，加 FTS 双通道 `fts/pg` / `fts/sqlite` / `sqlite-fts5.sql` |
| **作业层** | `jobs/consolidation`（158）/ `jobs/evidence-collector`（153）/ `jobs/snapshot`（114）——采证队列消费、L1/L2 快照刷新 |
| **工具面** | `tools/memory.ts`（**609 行**，MCP 记忆工具集）+ `tools/index.ts` 接线；`shared/db-types.ts`（+119） |
| **治理接线** | `governance/post-tool-router` / `prompt-router` / `session-start-guard`——把采证与召回接进 hook 生命周期 |
| **运维与评测** | `scripts/memory/{gate-runner,memory-jobs,probe-sqlite-fts5,recall-eval}`；标注集 `tests/memory/fixtures/recall-labeled-set.json`（**909 行**） |
| **测试** | `tests/memory/{domain,retrieval,tools-memory,hooks-memory,fts-pg.integration,sqlite-fts}` 共 6 套 |

> 这批代码是 0.3.35「记忆闭环」的直接前置：今天 README §⑤ 里写的位点确定性召回、FTS × 向量双通道融合、治理重排、幂等采证与快照，**检索骨架与工具骨架都源自这次提交**。

---

## 🐞 问题反馈者

### [@albertm88](https://github.com/albertm88) — 持续输出 issue

**贡献**：14 条 issue（[#5](https://github.com/xiaomingming92/add-coder/issues/5)–[#7](https://github.com/xiaomingming92/add-coder/issues/7)、[#10](https://github.com/xiaomingming92/add-coder/issues/10)–[#20](https://github.com/xiaomingming92/add-coder/issues/20)），全部已闭环。多数带着**可复现步骤与实测日志**——不是"提个想法"，是把边界条件替所有人先踩了一遍。

下表的"留下的痕迹"是仓库内可检索核对的相关落地位置（issue 与单个 commit 未必一一对应）：

| Issue | 报告的问题 | 留下的痕迹 |
|-------|-----------|-----------|
| [#5](https://github.com/xiaomingming92/add-coder/issues/5) | 跨会话注意力缺失：同样错误反复出现，审计记录未被消费 | 记忆闭环要回答的核心问题——审计记录要被**消费**，而不只是落库（README §⑤） |
| [#6](https://github.com/xiaomingming92/add-coder/issues/6) | 并发工具调用过多触发 429，会话瘫痪 | 读写分级信号量（读 8 / 写 4，超限排队反压）+ 429 指数退避（CHANGELOG 明记"issue #6 遗留"关闭；DEVELOPMENT §15.2） |
| [#7](https://github.com/xiaomingming92/add-coder/issues/7) | 未与用户逐项确认 API 字段就落盘，返工 + token 浪费 | HITL 逐项决策表：先把决策摊开，再写文件（README §⑧） |
| [#10](https://github.com/xiaomingming92/add-coder/issues/10) | 0.3.19 Windows 下 GUIDE 实测问题汇总 | `fix: 修复 issue #10 Windows 稳定性（5 问题 + 1 补充）` + `runCommand` 跨平台封装 + CHANGELOG 0.3.20 修复清单 |
| [#11](https://github.com/xiaomingming92/add-coder/issues/11) | 0.3.18 Codex 适配问题汇总（运行目录 / MCP 名称 / hooks / 门禁） | Codex 原生适配的起点（承接 #12） |
| [#12](https://github.com/xiaomingming92/add-coder/issues/12) | 完善 Codex 原生适配 + 多 IDE 并行稳定性 | `feat(codex): Codex MCP 原生适配 + 多 IDE 并发契约（issue #12）` + [multi-ide-concurrency-contract.md](./multi-ide-concurrency-contract.md) + README §⑪ |
| [#13](https://github.com/xiaomingming92/add-coder/issues/13) | 多 IDE 并行使用导致治理库端口漂移 | 统一端口分配器 + [ports.md](./ports.md) + `tests/ports-contract.test.ts` |
| [#14](https://github.com/xiaomingming92/add-coder/issues/14) | 0.3.25-0（preview）在 Windows 无法安装（atlas 依赖 install.js） | 跨平台安装链路修正 + [跨平台兼容开发规范.md](./跨平台兼容开发规范.md) |
| [#15](https://github.com/xiaomingming92/add-coder/issues/15) | Windows CRLF 让 Prisma sync 误报 enum 缺失并重复注入 | CRLF 归一与幂等修复 + `tests/crlf-diff.test.ts` 固化 |
| [#16](https://github.com/xiaomingming92/add-coder/issues/16) | Atlas 缺失时非交互环境（CI/管道）sync 永久挂起 | 非交互宽限结队 + 降级链（CHANGELOG 0.3.35 修复清单） |
| [#17](https://github.com/xiaomingming92/add-coder/issues/17) | 管道模式下多个 ask 只有第一个能读到输入 | `ask()` 管道模式修复 + `tests/ask-pipe.test.ts` 固化 |
| [#18](https://github.com/xiaomingming92/add-coder/issues/18) | preview dist-tag 低于 latest；预览版无 tag 不可追踪 | 发布流程可追踪性：[npm-publish-guide.md](./npm-publish-guide.md)（preview 流程） |
| [#19](https://github.com/xiaomingming92/add-coder/issues/19) | sync 未声明 `--yes` 却内部依赖，错误提示还引导用不存在的选项 | CLI 选项与提示对齐（CHANGELOG 0.3.35 修复清单） |
| [#20](https://github.com/xiaomingming92/add-coder/issues/20) | `create_hitl` 无法为首次 Plan 建审批记录（外键约束） | HITL 链路补全：`create_hitl` 行为与描述对齐、审批结论回写（CHANGELOG 0.3.35） |

---

## 🙌 如何加入这份清单

- **提 Issue**：[可复现的问题、实测日志、跨平台差异（Windows / macOS / Linux）、CI 与非交互场景](https://github.com/xiaomingming92/add-coder/issues)——都算硬贡献
- **提 PR**：[caijuehub TOML 规则](https://github.com/xiaomingming92/add-coder/pulls)（改规则不改代码）、模板与守卫、记忆 / 审计链路
- **参与讨论**：[Discussions](https://github.com/xiaomingming92/add-coder/discussions)

> 流程与规范见 **[CONTRIBUTING.md](../CONTRIBUTING.md)**（环境准备 / 提交规范 / 分支与 PR / [上榜标准](../CONTRIBUTING.md#贡献者墙)）。
> 清单随版本更新：本版对应 0.3.36。贡献记录以 git 历史与 issue 列表为准，欢迎补充遗漏。
