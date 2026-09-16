# add-coder npm 发布手册

- [发布流程](#发布流程)
  - [Preview 版本](#preview-版本当前分支)
  - [正式版本](#正式版本main-分支tag-触发)
- [鉴权](#鉴权)
- [版本号规则](#版本号规则)
- [常见错误](#常见错误)
- [CI 配置](#ci-配置)

---

## 发布流程

### Preview 版本（当前分支）

```bash
# 1. 构建
pnpm run build

# 2. 升版本号（可选，不改版本号则覆盖上次同版本）
npm version prerelease --no-git-tag-version
# → 0.3.6-feature-hitl-enhance-v1.0 → 0.3.6-feature-hitl-enhance-v1.1 → ...

# 3. 发布
npm publish --tag=preview --no-git-checks
```

用户安装：`npm install add-coder@preview`

### 正式版本（main 分支，**只能走 CI**）

```bash
# 1. 合并到 main
git checkout main && git merge feature/xxx

# 2. 打开 GitHub Actions → release → Run workflow
#    - 分支：main
#    - bump：patch / minor / major（0.3.37 → patch = 0.3.38）
#    CI 内部顺序：发版前置校验 → bump → gen-src-hash → 校验不变量 → 提交 + tag → npm publish → GitHub Release
```

> **禁止手工 bump / 手工 publish（正式版）**：本地 `npm version`（除 preview 的 `--no-git-tag-version` 外）与 `npm publish --tag=latest` 一律不做。
> 反例（2026-09-15 实测）：先把 `package.json` 手工 bump 到 `0.3.36`，又点 release workflow（bump=patch）→ CI 在 `0.3.36` 上再 patch 一次，
> 直接发布 **`0.3.37`**，`0.3.36` 被跳过且从未上 npm。两个入口各自"再 +1"，中间那版就被吃掉。
> 同理，`0.3.33` / `0.3.34` 是"手工 bump + 手工 publish"，没打 tag → git 里这两个版本没有 tag，也没有 GitHub Release。
> **这两个历史缺口保持现状，不追补 tag**（2026-09-16 决定）：npm 实况与 CHANGELOG 是权威记录，重推 tag 会触发 `publish.yml`（即便已加 registry 幂等跳过，
> 也只是补一条历史 GitHub Release，收益不抵噪声）。发版前置校验的 tag 断言只作用于**当前待发版本**，不受历史缺口影响。

> **发版前置校验（硬门禁，单一真源 `scripts/release-preflight.ts`）**：
> ① 仓库版本 == registry `latest`（双向：拦手工 bump 与手工 publish）；② `package.json` == `templates/.add-coder-src-hash.json._version`；
> ③ tag `v<版本>` 已存在。任一不过 → workflow 在 bump 之前就失败，不会污染 registry。
> 本地自检：`npm run release:preflight`（`-- --worktree` 追加工作区干净检查）。
> 若未来再出现"某版本缺 tag"（说明它没经 CI 发布），按校验输出的修复指引处理：在对应 bump 提交上补 tag 并推送，然后由 CI 重新发版。

CI 自动 `npm publish --tag=latest`。

## 鉴权

| 方式 | 适用 | 配置 |
|------|------|------|
| OIDC | CI (release.yml, preview.yml) | npm 官网 → Trusted Publisher → 添加 workflow |
| Token | 本地 manual | `npm login` 或 `NODE_AUTH_TOKEN` env |

## 版本号规则

| 类型 | 示例 | 触发 |
|------|------|------|
| 正式 | `0.3.6` | `npm version patch/minor/major` + git tag |
| Preview | `0.3.6-feature-hitl-enhance-v1.0` | `npm version prerelease --preid=xxx` |

## 常见错误

| 错误 | 原因 | 解决 |
|------|------|------|
| `ERR_PNPM_GIT_UNCLEAN` | 有未提交文件 | `--no-git-checks` |
| `403 Forbidden` | Token 类型不对 | 换 Automation token |
| `404 Not Found` | 不在 npm org 或未登录 | `npm login` 或检查 scope |
| `E403 Two-factor auth` | 2FA 要求但 token 不是 Automation 类型 | 在 npm 生成 Automation token |

## CI 配置

- **preview.yml**：feature/fix/feat/enhance 分支 push → build → bump → `--tag=preview`
- **publish.yml**：tag `v*` push → build → `--tag=latest` + GitHub Release
- **release.yml**：手动触发（唯一正式发版入口）→ 发版前置校验 → bump → src-hash 对齐 → 提交 + tag → publish + GitHub Release
