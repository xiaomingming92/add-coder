# add-coder-sync-patch-review-v1

## Review 元信息
- Review 对象: `.qoder/plans/2026-07/24/add-coder-sync-patch-plan-v1.md`
- Review 范围: sync --patch 热更新方案评审（双 hash + 两维判断矩阵）
- Review 时间: 2026-07-24
- Review 类型: 方案选型 + 架构设计
- 前置阅读: ADD Route, Plan

## 1. 总体结论
方向正确。双 hash（源 hash 在 prepare 打 npm + 产出 hash 在 init/patch 记用户）+ 两维判断矩阵（用户改没改 × 源变没变）→ 五路分组，精准区分"add-coder 更新的文件"和"用户改过的文件"。方案 D 选型合理——低侵入、独立可测、默认行为不变。

## 2. 正向评价
- ✅ 双 hash 职责分离清晰：源 hash 随包发布判断源变没变，产出 hash 记用户基线判断改没改
- ✅ PATCH_GUARD 只保护 plans/specs/reviews 三个用户数据目录，安全边界清晰
- ✅ selectFiles 复用已有交互 UI，不造新轮子
- ✅ 默认 sync 行为完全不变，无破坏性变更
- ✅ hash 8 位碰撞概率可忽略（253 个模板文件），轻量实用

## 3. 问题清单
| # | 严重度 | 类别 | 问题 | 建议 |
|---|:---:|------|------|------|
| 1 | 🟢 低 | 边界情况 | 源 hash 文件缺失（用户删除或首次 patch）→ 全部进 conflict。selectFiles 已支持 `[a]` 全选覆盖 / `[q]` 全部跳过。PATCH_GUARD 确保 plans/specs/reviews/settings.json/mcp.json 不被覆盖 | 无需改动，交互已覆盖此场景 |
| 2 | 🟢 低 | 边界情况 | 产出 hash 文件不存在时全部视作用户没改 → auto，可能误覆盖 | 可接受——首次 init 即写 hash，不会出现此状态 |

## 4. 影响评估
无破坏性变更。仅 `sync` 新增 `--patch` option，默认行为不变。init 新增 hash 写入（3 行），不影响现有流程。

## 5. 建议修正优先级
- 低: #1 源 hash 缺失回退策略
- 低: #2 产出 hash 缺失回退策略

## 6. 最终建议
可进入 Step 3 实施。建议 weather_proxy 实测后验证 hash 矩阵六场景覆盖。
