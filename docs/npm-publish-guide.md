# add-coder npm 发布手册

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

### 正式版本（main 分支，tag 触发）

```bash
# 1. 合并到 main
git checkout main && git merge feature/xxx

# 2. 打正式 tag
npm version patch   # 0.3.5 → 0.3.6
# 或
npm version minor   # 0.3.5 → 0.4.0

# 3. 推送 tag 触发 CI
git push --follow-tags
```

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
- **release.yml**：手动触发 → changelog + version bump + tag
