# add-coder-windows-stability review-runtime

> 运行时验证纠偏文档。在 checklist 通过、代码部署后，通过用户反馈或运行时日志发现的遗漏问题。

## Review 元信息

- **关联方案 review**: `.qoder/reviews/add-coder-windows-stability-review-v1.md`
- **关联实现 review**: `.qoder/reviews/add-coder-windows-stability-review-implementation-v1.md`
- **关联 checklist**: `.qoder/specs/add-coder-windows-stability/checklist.md`
- **Review 时间**: 2026-08-07
- **触发方式**: 待部署后（Windows 真机 / CI 双平台）

---

## 1. 发现列表

> 尚无运行时发现。以下为 checklist 流转的 `[R]` 待运行时验证清单。

### 待运行时验证（[R] 项清单）

1. **[R] Windows 真机（PowerShell）三命令回归**：`init + SQLite`、`sync --patch`、`stack set` 在 Windows 真机复测（issue #10 原始复现环境）
   - 预期：init 失败不再"假完成"（非零退出码 + 治理模型未就绪）；sync --patch 无变更 hash 条目不缩水；stack set 断言通过
   - 验证命令：`npx add-coder init --adapter=codex` / `npx add-coder sync --patch` / `npx add-coder stack set machineserver`
   - 状态：待 Windows 真机执行
2. **[R] Windows 真机 MCP 握手**：SQLite 项目 MCP 启动后 `tools/list` 正常（better-sqlite3 adapter 加载）
   - 前置：安装 `@prisma/adapter-better-sqlite3`；schema output 已指向 `src/generated/prisma`
   - 状态：待 Windows 真机执行
3. **[R] CI 双平台 vitest**：`.github/workflows/test.yml` 在 windows-latest + ubuntu 跑通
   - 注意：18 个 pre-existing 失败（createRequire + Node ESM 无扩展名）在 CI 同样存在属预期；新增 windows-stability 用例组（28 个）必须全绿
   - 状态：待 PR 触发
4. **[R] 已初始化 Windows 项目平滑迁移**：旧反斜杠 key 的 hash 文件首次 patch 不误判全量冲突（loadHashFile 兼容路径）
   - 状态：待 Windows 真机验证

---

## 2. review 流程改进项

| 检查项 | 具体操作 | 触发时机 |
|--------|---------|---------|
| 往返单测强制 | hash 语义变更必须补"保存→读取→与源比对"端到端用例（本次双重 hash 漏网教训） | checklist 生成时 |
| 派生副本声明 | add-route 附录声明 sync 派生物/生成物，避免 check_spec_sync 误报 | add-route 生成时 |

> 上述改进项应回流至 `review-implementation-template.md` 或 `checklist-template.md`，确保下次项目自动继承。

---

## 3. 已运行时修复项

（暂无——部署后填充）

---

## 4. 回流确认

- [ ] 流程改进项已写入对应模板（`review-implementation-template.md` / `checklist-template.md`）
- [ ] 修复项已记录审计日志（`record_dev_operation`）
