# add-coder 运行时报告 — gateway

> Gateway 边界合约断裂报告。由 appendRuntimeFinding() 自动追加。
> add-coder ↔ 外部系统（agrisynapse / h5-backend / farm-server）交互异常。
> 属于 `add-coder-runtime-report/` 体系，与静态 Reports 双向联动。

## 报告元信息

- **子系统**: `gateway`
- **来源**: `appendRuntimeFinding`
- **首次生成**: 2026-06-09
- **触发方式**: proxy / route 层运行时异常自动捕获

---

## 1. 发现列表

> 以下发现由 appendRuntimeFinding() 自动追加。

---

## 2. 关联 Report Issue

> 每条发现经人工 triage 后可关联到 `combined-report.md` 中的 Issue。

| 发现 | Report Issue | 状态 |
|------|-------------|:----:|
| — | — | — |

### 发现: 边界异常捕获

**时间**：2026-06-18T01:25:33.981Z
**来源**：`proxy`
**错误**：HASH_SEED_TEXT 环境变量未设置

**请求信息**：
- Method: GET
- Path: /api/agent/eaba0ca540af

```
Error: HASH_SEED_TEXT 环境变量未设置
    at getSeedText (webpack-internal:///(middleware)/./src/lib/hash-path.ts:25:15)
    at validateHash (webpack-internal:///(middleware)/./src/lib/hash-path.ts:72:18)
    at proxy (webpack-internal:///(middleware)/./src/proxy.ts:36:83)
    at eval (webpack-internal:///(middleware)/./node_modules/.pnpm/next@16.2.6_@babel+core@7.29.0_@playwright+test@1.60.0_react-dom@19.2.4_react@19.2.4__react@19.2.4/node_modules/next/dist/build/webpack/loaders/next-middleware-loader.js?absolutePagePath=%2FUsers%2Fmilkytea%2FWebstormProjects%2FrfMain%2F%E6%99%BA%E8%83%BD%E4%BD%93%2Fadd-coder%2Fsrc%2Fproxy.ts&page=%2Fproxy&rootDir=%2FUsers%2Fmilkytea%2FWebstormProjects%2FrfMain%2F%E6%99%BA%E8%83%BD%E4%BD%93%2Fadd-coder&matchers=&preferredRegion=&middlewareConfig=e30%3D!:52:26)
```

- [x] Triage 结果: 已关闭 — 环境问题，需配置 HASH_SEED_TEXT 环境变量。关闭时间: 2026-07-01

### 发现: 边界异常捕获

**时间**：2026-06-18T01:25:33.980Z
**来源**：`proxy`
**错误**：HASH_SEED_TEXT 环境变量未设置

**请求信息**：
- Method: GET
- Path: /api/agent/eaba0ca540af

```
Error: HASH_SEED_TEXT 环境变量未设置
    at getSeedText (webpack-internal:///(middleware)/./src/lib/hash-path.ts:25:15)
    at validateHash (webpack-internal:///(middleware)/./src/lib/hash-path.ts:72:18)
    at proxy (webpack-internal:///(middleware)/./src/proxy.ts:36:83)
    at eval (webpack-internal:///(middleware)/./node_modules/.pnpm/next@16.2.6_@babel+core@7.29.0_@playwright+test@1.60.0_react-dom@19.2.4_react@19.2.4__react@19.2.4/node_modules/next/dist/build/webpack/loaders/next-middleware-loader.js?absolutePagePath=%2FUsers%2Fmilkytea%2FWebstormProjects%2FrfMain%2F%E6%99%BA%E8%83%BD%E4%BD%93%2Fadd-coder%2Fsrc%2Fproxy.ts&page=%2Fproxy&rootDir=%2FUsers%2Fmilkytea%2FWebstormProjects%2FrfMain%2F%E6%99%BA%E8%83%BD%E4%BD%93%2Fadd-coder&matchers=&preferredRegion=&middlewareConfig=e30%3D!:52:26)
```

- [x] Triage 结果: 已关闭 — 环境问题，需配置 HASH_SEED_TEXT 环境变量。关闭时间: 2026-07-01

### 发现: 边界异常捕获

**时间**：2026-06-18T01:29:05.323Z
**来源**：`proxy`
**错误**：HASH_SEED_TEXT 环境变量未设置

**请求信息**：
- Method: GET
- Path: /api/agent/eaba0ca540af

```
Error: HASH_SEED_TEXT 环境变量未设置
    at getSeedText (webpack-internal:///(middleware)/./src/lib/hash-path.ts:25:15)
    at validateHash (webpack-internal:///(middleware)/./src/lib/hash-path.ts:72:18)
    at proxy (webpack-internal:///(middleware)/./src/proxy.ts:36:83)
    at eval (webpack-internal:///(middleware)/./node_modules/.pnpm/next@16.2.6_@babel+core@7.29.0_@playwright+test@1.60.0_react-dom@19.2.4_react@19.2.4__react@19.2.4/node_modules/next/dist/build/webpack/loaders/next-middleware-loader.js?absolutePagePath=%2FUsers%2Fmilkytea%2FWebstormProjects%2FrfMain%2F%E6%99%BA%E8%83%BD%E4%BD%93%2Fadd-coder%2Fsrc%2Fproxy.ts&page=%2Fproxy&rootDir=%2FUsers%2Fmilkytea%2FWebstormProjects%2FrfMain%2F%E6%99%BA%E8%83%BD%E4%BD%93%2Fadd-coder&matchers=&preferredRegion=&middlewareConfig=e30%3D!:52:26)
```

- [x] Triage 结果: 已关闭 — 环境问题，需配置 HASH_SEED_TEXT 环境变量。关闭时间: 2026-07-01

### 发现: 边界异常捕获

**时间**：2026-06-18T01:29:05.326Z
**来源**：`proxy`
**错误**：HASH_SEED_TEXT 环境变量未设置

**请求信息**：
- Method: GET
- Path: /api/agent/eaba0ca540af

```
Error: HASH_SEED_TEXT 环境变量未设置
    at getSeedText (webpack-internal:///(middleware)/./src/lib/hash-path.ts:25:15)
    at validateHash (webpack-internal:///(middleware)/./src/lib/hash-path.ts:72:18)
    at proxy (webpack-internal:///(middleware)/./src/proxy.ts:36:83)
    at eval (webpack-internal:///(middleware)/./node_modules/.pnpm/next@16.2.6_@babel+core@7.29.0_@playwright+test@1.60.0_react-dom@19.2.4_react@19.2.4__react@19.2.4/node_modules/next/dist/build/webpack/loaders/next-middleware-loader.js?absolutePagePath=%2FUsers%2Fmilkytea%2FWebstormProjects%2FrfMain%2F%E6%99%BA%E8%83%BD%E4%BD%93%2Fadd-coder%2Fsrc%2Fproxy.ts&page=%2Fproxy&rootDir=%2FUsers%2Fmilkytea%2FWebstormProjects%2FrfMain%2F%E6%99%BA%E8%83%BD%E4%BD%93%2Fadd-coder&matchers=&preferredRegion=&middlewareConfig=e30%3D!:52:26)
```

- [x] Triage 结果: 已关闭 — 环境问题，需配置 HASH_SEED_TEXT 环境变量。关闭时间: 2026-07-01

### 发现: 边界异常捕获

**时间**：2026-06-18T01:30:44.017Z
**来源**：`proxy`
**错误**：HASH_SEED_TEXT 环境变量未设置

**请求信息**：
- Method: GET
- Path: /api/agent/a9a993d14c7b

```
Error: HASH_SEED_TEXT 环境变量未设置
    at getSeedText (webpack-internal:///(middleware)/./src/lib/hash-path.ts:25:15)
    at validateHash (webpack-internal:///(middleware)/./src/lib/hash-path.ts:72:18)
    at proxy (webpack-internal:///(middleware)/./src/proxy.ts:36:83)
    at eval (webpack-internal:///(middleware)/./node_modules/.pnpm/next@16.2.6_@babel+core@7.29.0_@playwright+test@1.60.0_react-dom@19.2.4_react@19.2.4__react@19.2.4/node_modules/next/dist/build/webpack/loaders/next-middleware-loader.js?absolutePagePath=%2FUsers%2Fmilkytea%2FWebstormProjects%2FrfMain%2F%E6%99%BA%E8%83%BD%E4%BD%93%2Fadd-coder%2Fsrc%2Fproxy.ts&page=%2Fproxy&rootDir=%2FUsers%2Fmilkytea%2FWebstormProjects%2FrfMain%2F%E6%99%BA%E8%83%BD%E4%BD%93%2Fadd-coder&matchers=&preferredRegion=&middlewareConfig=e30%3D!:52:26)
```

- [x] Triage 结果: 已关闭 — 环境问题，需配置 HASH_SEED_TEXT 环境变量。关闭时间: 2026-07-01

### 发现: 边界异常捕获

**时间**：2026-06-18T01:30:44.016Z
**来源**：`proxy`
**错误**：HASH_SEED_TEXT 环境变量未设置

**请求信息**：
- Method: GET
- Path: /api/agent/a9a993d14c7b

```
Error: HASH_SEED_TEXT 环境变量未设置
    at getSeedText (webpack-internal:///(middleware)/./src/lib/hash-path.ts:25:15)
    at validateHash (webpack-internal:///(middleware)/./src/lib/hash-path.ts:72:18)
    at proxy (webpack-internal:///(middleware)/./src/proxy.ts:36:83)
    at eval (webpack-internal:///(middleware)/./node_modules/.pnpm/next@16.2.6_@babel+core@7.29.0_@playwright+test@1.60.0_react-dom@19.2.4_react@19.2.4__react@19.2.4/node_modules/next/dist/build/webpack/loaders/next-middleware-loader.js?absolutePagePath=%2FUsers%2Fmilkytea%2FWebstormProjects%2FrfMain%2F%E6%99%BA%E8%83%BD%E4%BD%93%2Fadd-coder%2Fsrc%2Fproxy.ts&page=%2Fproxy&rootDir=%2FUsers%2Fmilkytea%2FWebstormProjects%2FrfMain%2F%E6%99%BA%E8%83%BD%E4%BD%93%2Fadd-coder&matchers=&preferredRegion=&middlewareConfig=e30%3D!:52:26)
```

- [x] Triage 结果: 已关闭 — 环境问题，需配置 HASH_SEED_TEXT 环境变量。关闭时间: 2026-07-01

### 发现: 边界异常捕获

**时间**：2026-06-22T04:43:51.143Z
**来源**：`route`
**错误**：null

**合约断裂点**：
- 期望：`轮换成功(5min宽限)`
- 实际：`ruifengyun-h5-backend`

**请求信息**：
- Method: PUT
- Path: /api/admin/service-accounts

- [x] Triage 结果: ✅ 已修复 — commit 3d811e8（移除成功路径 contract 参数，消除误报）。关闭时间: 2026-07-01

### 发现: 边界异常捕获

**时间**：2026-06-24T10:20:24.286Z
**来源**：`route`
**错误**：null

**合约断裂点**：
- 期望：`轮换成功(5min宽限)`
- 实际：`ruifengyun-h5-backend`

**请求信息**：
- Method: PUT
- Path: /api/admin/service-accounts

- [x] Triage 结果: ✅ 已修复 — commit 3d811e8（移除成功路径 contract 参数，消除误报）。关闭时间: 2026-07-01

### 发现: 边界异常捕获

**时间**：2026-06-24T10:42:24.799Z
**来源**：`route`
**错误**：Cannot read properties of undefined (reading 'findUnique')

**请求信息**：
- Method: PUT
- Path: /api/admin/service-accounts

```
TypeError: Cannot read properties of undefined (reading 'findUnique')
    at PUT (/home/xmm/ai/add-coder/.next/dev/server/chunks/[root-of-the-server]__0676-yj._.js:741:175)
    at AsyncLocalStorage.run (node:internal/async_local_storage/async_hooks:80:14)
    at AppRouteRouteModule.do (/home/xmm/ai/add-coder/node_modules/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js:5:40179)
    at /home/xmm/ai/add-coder/node_modules/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js:5:50152
```

- [x] Triage 结果: ✅ 已修复 — commit 3d811e8（维护模式 + 幂等闸门）。关闭时间: 2026-07-01

### 发现: 边界异常捕获

**时间**：2026-06-24T10:42:55.503Z
**来源**：`route`
**错误**：Cannot read properties of undefined (reading 'findUnique')

**请求信息**：
- Method: PUT
- Path: /api/admin/service-accounts

```
TypeError: Cannot read properties of undefined (reading 'findUnique')
    at PUT (/home/xmm/ai/add-coder/.next/dev/server/chunks/[root-of-the-server]__0676-yj._.js:741:175)
    at AsyncLocalStorage.run (node:internal/async_local_storage/async_hooks:80:14)
    at AppRouteRouteModule.do (/home/xmm/ai/add-coder/node_modules/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js:5:40179)
    at /home/xmm/ai/add-coder/node_modules/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js:5:50152
```

- [x] Triage 结果: ✅ 已修复 — commit 3d811e8（维护模式 + 幂等闸门）。关闭时间: 2026-07-01

### 发现: 边界异常捕获

**时间**：2026-06-24T10:46:23.695Z
**来源**：`route`
**错误**：null

**合约断裂点**：
- 期望：`轮换成功(5min宽限)`
- 实际：`ruifengyun-h5-backend`

**请求信息**：
- Method: PUT
- Path: /api/admin/service-accounts

- [x] Triage 结果: ✅ 已修复 — commit 3d811e8（移除成功路径 contract 参数，消除误报）。关闭时间: 2026-07-01

### 发现: 边界异常捕获

**时间**：2026-06-24T10:50:18.526Z
**来源**：`route`
**错误**：null

**合约断裂点**：
- 期望：`轮换成功(5min宽限)`
- 实际：`ruifengyun-h5-backend`

**请求信息**：
- Method: PUT
- Path: /api/admin/service-accounts

- [x] Triage 结果: ✅ 已修复 — commit 3d811e8（移除成功路径 contract 参数，消除误报）。关闭时间: 2026-07-01

### 发现: 边界异常捕获

**时间**：2026-06-24T10:53:25.458Z
**来源**：`route`
**错误**：null

**合约断裂点**：
- 期望：`轮换成功(5min宽限)`
- 实际：`ruifengyun-h5-backend`

**请求信息**：
- Method: PUT
- Path: /api/admin/service-accounts

- [x] Triage 结果: ✅ 已修复 — commit 3d811e8（移除成功路径 contract 参数，消除误报）。关闭时间: 2026-07-01

### 发现: 边界异常捕获

**时间**：2026-06-24T10:59:15.091Z
**来源**：`route`
**错误**：null

**合约断裂点**：
- 期望：`轮换成功(5min宽限)`
- 实际：`ruifengyun-h5-backend`

**请求信息**：
- Method: PUT
- Path: /api/admin/service-accounts

- [x] Triage 结果: ✅ 已修复 — commit 3d811e8（移除成功路径 contract 参数，消除误报）。关闭时间: 2026-07-01

### 发现: 边界异常捕获

**时间**：2026-06-24T11:00:44.468Z
**来源**：`route`
**错误**：null

**合约断裂点**：
- 期望：`轮换成功(5min宽限)`
- 实际：`ruifengyun-h5-backend`

**请求信息**：
- Method: PUT
- Path: /api/admin/service-accounts

- [x] Triage 结果: ✅ 已修复 — commit 3d811e8（移除成功路径 contract 参数，消除误报）。关闭时间: 2026-07-01

### 发现: 边界异常捕获

**时间**：2026-06-24T11:11:12.818Z
**来源**：`route`
**错误**：null

**合约断裂点**：
- 期望：`轮换成功(5min宽限)`
- 实际：`ruifengyun-h5-backend`

**请求信息**：
- Method: PUT
- Path: /api/admin/service-accounts

- [x] Triage 结果: ✅ 已修复 — commit 3d811e8（移除成功路径 contract 参数，消除误报）。关闭时间: 2026-07-01

### 发现: 边界异常捕获

**时间**：2026-06-24T11:13:01.554Z
**来源**：`route`
**错误**：null

**合约断裂点**：
- 期望：`轮换成功(5min宽限)`
- 实际：`ruifengyun-h5-backend`

**请求信息**：
- Method: PUT
- Path: /api/admin/service-accounts

- [x] Triage 结果: ✅ 已修复 — commit 3d811e8（移除成功路径 contract 参数，消除误报）。关闭时间: 2026-07-01

### 发现: 边界异常捕获

**时间**：2026-06-24T11:15:00.335Z
**来源**：`route`
**错误**：null

**合约断裂点**：
- 期望：`轮换成功(5min宽限)`
- 实际：`ruifengyun-h5-backend`

**请求信息**：
- Method: PUT
- Path: /api/admin/service-accounts

- [x] Triage 结果: ✅ 已修复 — commit 3d811e8（移除成功路径 contract 参数，消除误报）。关闭时间: 2026-07-01

### 发现: 边界异常捕获

**时间**：2026-06-24T11:19:13.537Z
**来源**：`route`
**错误**：null

**合约断裂点**：
- 期望：`轮换成功(5min宽限)`
- 实际：`ruifengyun-h5-backend`

**请求信息**：
- Method: PUT
- Path: /api/admin/service-accounts

- [x] Triage 结果: ✅ 已修复 — commit 3d811e8（移除成功路径 contract 参数，消除误报）。关闭时间: 2026-07-01

### 发现: 边界异常捕获

**时间**：2026-06-24T11:21:31.824Z
**来源**：`route`
**错误**：null

**合约断裂点**：
- 期望：`轮换成功(5min宽限)`
- 实际：`ruifengyun-h5-backend`

**请求信息**：
- Method: PUT
- Path: /api/admin/service-accounts

- [x] Triage 结果: ✅ 已修复 — commit 3d811e8（移除成功路径 contract 参数，消除误报）。关闭时间: 2026-07-01

### 发现: 边界异常捕获

**时间**：2026-06-24T11:22:12.956Z
**来源**：`route`
**错误**：null

**合约断裂点**：
- 期望：`轮换成功(5min宽限)`
- 实际：`ruifengyun-h5-backend`

**请求信息**：
- Method: PUT
- Path: /api/admin/service-accounts

- [x] Triage 结果: ✅ 已修复 — commit 3d811e8（移除成功路径 contract 参数，消除误报）。关闭时间: 2026-07-01

### 发现: 边界异常捕获

**时间**：2026-06-24T11:25:17.590Z
**来源**：`route`
**错误**：null

**合约断裂点**：
- 期望：`轮换成功(5min宽限)`
- 实际：`ruifengyun-h5-backend`

**请求信息**：
- Method: PUT
- Path: /api/admin/service-accounts

- [x] Triage 结果: ✅ 已修复 — commit 3d811e8（移除成功路径 contract 参数，消除误报）。关闭时间: 2026-07-01

### 发现: 边界异常捕获

**时间**：2026-06-24T11:27:14.234Z
**来源**：`route`
**错误**：null

**合约断裂点**：
- 期望：`轮换成功(5min宽限)`
- 实际：`ruifengyun-h5-backend`

**请求信息**：
- Method: PUT
- Path: /api/admin/service-accounts

- [x] Triage 结果: ✅ 已修复 — commit 3d811e8（移除成功路径 contract 参数，消除误报）。关闭时间: 2026-07-01

### 发现: 边界异常捕获

**时间**：2026-06-24T11:37:46.513Z
**来源**：`route`
**错误**：null

**合约断裂点**：
- 期望：`轮换成功(5min宽限)`
- 实际：`ruifengyun-h5-backend`

**请求信息**：
- Method: PUT
- Path: /api/admin/service-accounts

- [x] Triage 结果: ✅ 已修复 — commit 3d811e8（移除成功路径 contract 参数，消除误报）。关闭时间: 2026-07-01

### 发现: 边界异常捕获

**时间**：2026-06-24T11:44:21.955Z
**来源**：`route`
**错误**：null

**合约断裂点**：
- 期望：`轮换成功(5min宽限)`
- 实际：`ruifengyun-h5-backend`

**请求信息**：
- Method: PUT
- Path: /api/admin/service-accounts

- [x] Triage 结果: ✅ 已修复 — commit 3d811e8（移除成功路径 contract 参数，消除误报）。关闭时间: 2026-07-01

### 发现: 边界异常捕获

**时间**：2026-06-24T12:28:29.886Z
**来源**：`route`
**错误**：null

**合约断裂点**：
- 期望：`轮换成功(5min宽限)`
- 实际：`ruifengyun-h5-backend`

**请求信息**：
- Method: PUT
- Path: /api/admin/service-accounts

- [x] Triage 结果: ✅ 已修复 — commit 3d811e8（移除成功路径 contract 参数，消除误报）。关闭时间: 2026-07-01

### 发现: 边界异常捕获

**时间**：2026-06-30T05:21:07.566Z
**来源**：`route`
**错误**：null

**合约断裂点**：
- 期望：`轮换成功(5min宽限)`
- 实际：`ruifengyun-h5-backend`

**请求信息**：
- Method: PUT
- Path: /api/admin/service-accounts

- [x] Triage 结果: ✅ 已修复 — commit 3d811e8（移除成功路径 contract 参数，消除误报）。关闭时间: 2026-07-01

### 发现: route /api/agent/test123: 未知 GET action: null
<!-- signature: route::/api/agent/test123::未知 GET action: null -->

**时间**：2026-07-01T02:17:45.226Z
**来源**：`route`
**错误**：未知 GET action: null

**请求信息**：
- Method: GET
- Path: /api/agent/test123

```
Error: 未知 GET action: null
    at GET (webpack-internal:///(rsc)/./src/app/api/agent/[hash]/route.ts:719:100)
    at AsyncLocalStorage.run (node:internal/async_local_storage/async_hooks:80:14)
    at AppRouteRouteModule.do (/home/xmm/ai/add-coder/node_modules/next/dist/compiled/next-server/app-route.runtime.dev.js:5:40179)
    at /home/xmm/ai/add-coder/node_modules/next/dist/compiled/next-server/app-route.runtime.dev.js:5:50152
```

- [x] Triage 结果: 已关闭 — 测试请求 / 无效 hash 的正常拒绝行为。关闭时间: 2026-07-01

### 发现: route /api/agent/another123: 未知 GET action: null
<!-- signature: route::/api/agent/another123::未知 GET action: null -->

**时间**：2026-07-01T02:20:47.608Z
**来源**：`route`
**错误**：未知 GET action: null

**请求信息**：
- Method: GET
- Path: /api/agent/another123

```
Error: 未知 GET action: null
    at GET (webpack-internal:///(rsc)/./src/app/api/agent/[hash]/route.ts:719:100)
    at AsyncLocalStorage.run (node:internal/async_local_storage/async_hooks:80:14)
    at AppRouteRouteModule.do (/home/xmm/ai/add-coder/node_modules/next/dist/compiled/next-server/app-route.runtime.dev.js:5:40179)
    at /home/xmm/ai/add-coder/node_modules/next/dist/compiled/next-server/app-route.runtime.dev.js:5:50152
```

- [x] Triage 结果: 已关闭 — 测试请求 / 无效 hash 的正常拒绝行为。关闭时间: 2026-07-01

### 发现: route /api/agent/fresh123: 未知 GET action: null
<!-- signature: route::/api/agent/fresh123::未知 GET action: null -->

**时间**：2026-07-01T02:29:44.936Z
**来源**：`route`
**错误**：未知 GET action: null

**请求信息**：
- Method: GET
- Path: /api/agent/fresh123

```
Error: 未知 GET action: null
    at GET (webpack-internal:///(rsc)/./src/app/api/agent/[hash]/route.ts:719:100)
    at AsyncLocalStorage.run (node:internal/async_local_storage/async_hooks:80:14)
    at AppRouteRouteModule.do (/home/xmm/ai/add-coder/node_modules/next/dist/compiled/next-server/app-route.runtime.dev.js:5:40179)
    at /home/xmm/ai/add-coder/node_modules/next/dist/compiled/next-server/app-route.runtime.dev.js:5:50152
```

- [x] Triage 结果: 已关闭 — 测试请求 / 无效 hash 的正常拒绝行为。关闭时间: 2026-07-01

### 发现: route /api/agent/timecheck: 未知 GET action: null
<!-- signature: route::/api/agent/timecheck::未知 GET action: null -->

**时间**：2026-07-01T10:37:42.805+08:00
**来源**：`route`
**错误**：未知 GET action: null

**请求信息**：
- Method: GET
- Path: /api/agent/timecheck

```
Error: 未知 GET action: null
    at GET (webpack-internal:///(rsc)/./src/app/api/agent/[hash]/route.ts:719:100)
    at AsyncLocalStorage.run (node:internal/async_local_storage/async_hooks:80:14)
    at AppRouteRouteModule.do (/home/xmm/ai/add-coder/node_modules/next/dist/compiled/next-server/app-route.runtime.dev.js:5:40179)
    at /home/xmm/ai/add-coder/node_modules/next/dist/compiled/next-server/app-route.runtime.dev.js:5:50152
```

- [x] Triage 结果: 已关闭 — 测试请求 / 无效 hash 的正常拒绝行为。关闭时间: 2026-07-01

### 发现: proxy /api/agent/test123: Hash 校验失败: hash=test123
<!-- signature: proxy::/api/agent/test123::Hash 校验失败: hash=test123 -->

**时间**：2026-07-01T15:59:28.682+08:00
**来源**：`proxy`
**错误**：Hash 校验失败: hash=test123

**请求信息**：
- Method: GET
- Path: /api/agent/test123

```
Error: Hash 校验失败: hash=test123
    at eval (webpack-internal:///(middleware)/./src/proxy.ts:67:269)
```

- [x] Triage 结果: 已关闭 — 测试请求 / 无效 hash 的正常拒绝行为。关闭时间: 2026-07-01

### 发现: proxy /api/agent/test: Hash 校验失败: hash=test
<!-- signature: proxy::/api/agent/test::Hash 校验失败: hash=test -->

**时间**：2026-07-01T16:24:02.928+08:00
**来源**：`proxy`
**错误**：Hash 校验失败: hash=test

**请求信息**：
- Method: GET
- Path: /api/agent/test

```
Error: Hash 校验失败: hash=test
    at eval (webpack-internal:///(middleware)/./src/proxy.ts:67:269)
```

- [x] Triage 结果: 已关闭 — 测试请求 / 无效 hash 的正常拒绝行为。关闭时间: 2026-07-01

### 发现: proxy /api/agent/test: Hash 校验失败: hash=test
<!-- signature: proxy::/api/agent/test::Hash 校验失败: hash=test -->

**时间**：2026-07-01T16:24:02.948+08:00
**来源**：`proxy`
**错误**：Hash 校验失败: hash=test

**请求信息**：
- Method: POST
- Path: /api/agent/test

```
Error: Hash 校验失败: hash=test
    at eval (webpack-internal:///(middleware)/./src/proxy.ts:67:269)
```

- [x] Triage 结果: 已关闭 — 测试请求 / 无效 hash 的正常拒绝行为。关闭时间: 2026-07-01

### 发现: proxy /api/agent/docs/agrisynapse: Hash 校验失败: hash=docs
<!-- signature: proxy::/api/agent/docs/agrisynapse::Hash 校验失败: hash=docs -->

**时间**：2026-07-01T17:36:44.313+08:00
**来源**：`proxy`
**错误**：Hash 校验失败: hash=docs

**请求信息**：
- Method: GET
- Path: /api/agent/docs/agrisynapse

```
Error: Hash 校验失败: hash=docs
    at eval (webpack-internal:///(middleware)/./src/proxy.ts:67:269)
```

- [x] Triage 结果: 已关闭 — proxy 正则分流修复完成（v5.4 白名单替换为正则 `/^[a-f0-9]{12}$/`），docs 路径自动跳过 hash 校验。关闭时间: 2026-07-03

### 发现: proxy /api/agent/health: Hash 校验失败: hash=health
<!-- signature: proxy::/api/agent/health::Hash 校验失败: hash=health -->

**时间**：2026-07-02T21:04:51.971+08:00
**来源**：`proxy`
**错误**：Hash 校验失败: hash=health

**请求信息**：
- Method: GET
- Path: /api/agent/health

```
Error: Hash 校验失败: hash=health
    at eval (webpack-internal:///(middleware)/./src/proxy.ts:71:269)
```

- [x] Triage 结果: 已关闭 — proxy 正则分流修复完成，非 hash 路径自动放行。关闭时间: 2026-07-03

### 发现: proxy /api/agent/chat: Hash 校验失败: hash=chat
<!-- signature: proxy::/api/agent/chat::Hash 校验失败: hash=chat -->

**时间**：2026-07-02T21:04:58.298+08:00
**来源**：`proxy`
**错误**：Hash 校验失败: hash=chat

**请求信息**：
- Method: POST
- Path: /api/agent/chat

```
Error: Hash 校验失败: hash=chat
    at eval (webpack-internal:///(middleware)/./src/proxy.ts:71:269)
```

- [x] Triage 结果: 已关闭 — proxy 正则分流修复完成（`/^[a-f0-9]{12}$/` 区分 hash 路由与固定路径），自有 GUI 端点不再误拦。关闭时间: 2026-07-03

### 发现: proxy /api/agent/stream: Hash 校验失败: hash=stream
<!-- signature: proxy::/api/agent/stream::Hash 校验失败: hash=stream -->

**时间**：2026-07-03T09:38:28.664+08:00
**来源**：`proxy`
**错误**：Hash 校验失败: hash=stream

**请求信息**：
- Method: POST
- Path: /api/agent/stream

```
Error: Hash 校验失败: hash=stream
    at eval (webpack-internal:///(middleware)/./src/proxy.ts:71:269)
```

- [x] Triage 结果: 已关闭 — proxy 正则分流修复完成（`/^[a-f0-9]{12}$/` 区分 hash 路由与固定路径），自有 GUI 端点不再误拦。关闭时间: 2026-07-03

### 发现: proxy /api/agent/chat/stream: Hash 校验失败: hash=chat
<!-- signature: proxy::/api/agent/chat/stream::Hash 校验失败: hash=chat -->

**时间**：2026-07-03T09:39:04.274+08:00
**来源**：`proxy`
**错误**：Hash 校验失败: hash=chat

**请求信息**：
- Method: POST
- Path: /api/agent/chat/stream

```
Error: Hash 校验失败: hash=chat
    at eval (webpack-internal:///(middleware)/./src/proxy.ts:71:269)
```

- [x] Triage 结果: 已关闭 — proxy 正则分流修复完成（`/^[a-f0-9]{12}$/` 区分 hash 路由与固定路径），自有 GUI 端点不再误拦。关闭时间: 2026-07-03

### 发现: route /api/agent/invalidhash: 未知 POST type: null
<!-- signature: route::/api/agent/invalidhash::未知 POST type: null -->

**时间**：2026-07-03T09:50:31.557+08:00
**来源**：`route`
**错误**：未知 POST type: null

**请求信息**：
- Method: POST
- Path: /api/agent/invalidhash

```
Error: 未知 POST type: null
    at POST (webpack-internal:///(rsc)/./src/app/api/agent/[hash]/route.ts:1034:100)
    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
    at async AppRouteRouteModule.do (/home/xmm/ai/add-coder/node_modules/.pnpm/next@16.2.10_@babel+core@7.29.7_@playwright+test@1.61.1_react-dom@19.2.7_react@19.2.7__react@19.2.7/node_modules/next/dist/compiled/next-server/app-route.runtime.dev.js:5:40131)
    at async AppRouteRouteModule.handle (/home/xmm/ai/add-coder/node_modules/.pnpm/next@16.2.10_@babel+core@7.29.7_@playwright+test@1.61.1_react-dom@19.2.7_react@19.2.7__react@19.2.7/node_modules/next/dist/compiled/next-server/app-route.runtime.dev.js:5:47411)
```

- [x] Triage 结果: 已关闭 — ESLint 修复 runtime 验证时的无害测试请求。关闭时间: 2026-07-03
