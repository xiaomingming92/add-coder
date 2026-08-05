# add-coder-stack-profile-review-runtime

> 运行时验证纠偏文档。在 checklist 通过、代码部署后，通过用户反馈或运行时日志发现的遗漏问题。

## Review 元信息

- **关联方案 review**: `.qoder/reviews/add-coder-stack-profile-review-v1.md`
- **关联实现 review**: `.qoder/reviews/add-coder-stack-profile-review-implementation.md`
- **关联 checklist**: `.qoder/specs/add-coder-stack-profile/checklist.md`
- **Review 时间**: 2026-08-05
- **触发方式**: 初始化（E2E 待真实项目验证）

---

## 1. 发现列表

> 序号延续前置 review 的最后一条发现编号。

尚无运行时发现。

### 待运行时验证清单（来自 checklist [R] 项）

1. `npx add-coder init --stack machineserver` 在真实用户项目中全流程（含 MCP context 返回 profile 内容）
2. `add-coder stack set` 切换后，IDE 新会话 AI 上下文包含新 profile 约束

---

## 2. review 流程改进项

| 检查项 | 具体操作 | 触发时机 |
|--------|---------|---------|
| 中性引用行回归 | init/sync 后 grep `stackReferenceLine` 残留，断言两态渲染 | 每次 init/sync 后 |
| 多 MCP 身份断言 | MCP 工具列表 description 含 `[项目: {PROJECT_ID}]` 前缀 | MCP 启动后 |

> 上述改进项应回流至 `review-implementation-template.md` 或 `checklist-template.md`，确保下次项目自动继承。

---

## 3. 已运行时修复项

无（初始化阶段）。

---

## 4. 回流确认

- [ ] 流程改进项已写入对应模板（`review-implementation-template.md` / `checklist-template.md`）
- [ ] 修复项已记录审计日志（`record_dev_operation`）
