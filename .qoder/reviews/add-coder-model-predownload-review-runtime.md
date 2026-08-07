# add-coder-model-predownload-review-runtime

> 运行时验证纠偏文档。在 checklist 通过、代码部署后，通过用户反馈或运行时日志发现的遗漏问题。

## Review 元信息

- **关联方案 review**: `.qoder/reviews/add-coder-model-predownload-review-v1.md`
- **关联实现 review**: `.qoder/reviews/add-coder-model-predownload-review-implementation-v1.md`
- **关联 checklist**: `.qoder/specs/add-coder-model-predownload/checklist.md`
- **Review 时间**: 2026-08-07
- **触发方式**: 待部署后（用户实测 / CI / 首次 DPS 调用）

---

## 1. 发现列表

> 尚无运行时发现。以下为 checklist 流转的 `[R]` 待运行时验证清单。

### 待运行时验证（[R] 项清单）

1. **[R] `model:download` 首次执行下载成功**：`~/.cache/huggingface/hub/models--Xenova--bge-small-zh-v1.5/snapshots/` 出现模型文件（当前已在开发机验证 ✅，发布版待验证）
2. **[R] 二次执行幂等**：输出 `already-cached`，无重复下载（开发机已验证 ✅）
3. **[R] `add-coder sync` 缓存存在时无警告**：控制台无 warn 输出
4. **[R] `add-coder init --dry-run --skip-model` 不触发下载**：控制台无下载日志；skip 时打印 `模型预下载: skipped`（Review P2 #5）
5. **[R] `sync --model` 缓存缺失时触发下载**：成功后缓存目录出现模型文件
6. **[R] 下载失败（模拟断网）init/sync 不中断退出**：warn 后主流程继续，退出码 0
7. **[R] 用户项目 MCP 运行时复用预下载缓存**：`getEmbeddings()` 首次调用不重新下载（helpers.ts cacheDir 同源锚定生效）
8. **[R] Windows 真机**：缓存路径 `%USERPROFILE%\.cache\huggingface\hub`（os.homedir 解析，呼应跨平台规范）

---

## 2. review 流程改进项

| 检查项 | 具体操作 | 触发时机 |
|--------|---------|---------|
| 缓存路径同源验证 | 实现审查时实测下载目标路径（transformers v3 默认包内 .cache 陷阱），确认 CLI 与模板双侧锚定 | 涉及 transformers/HF 缓存的功能 |
| 新命令幂等验证 | 新命令实现后实机执行两次（首次下载 + 二次幂等），而非仅 --help 冒烟 | CLI 新命令 |

> 上述改进项应回流至 `review-implementation-template.md` 或 `checklist-template.md`，确保下次项目自动继承。

---

## 3. 已运行时修复项

（无——发布前无运行时修复）

---

## 4. 回流确认

- [ ] 流程改进项已写入对应模板（`review-implementation-template.md` / `checklist-template.md`）
- [ ] 修复项已记录审计日志（`record_dev_operation`）
