# 模板运行时依赖清单（Template Runtime Dependencies）

> 本文件随 `sync` 同步到项目的 `.add/`（或对应 magic 目录）。**基建依赖必须在安装期解决，不要等到运行时（如 DPS 评分）才发现缺失。**
>
> 两类资源的责任边界：
>
> | 类别 | 解决时机 | 负责方 |
> |------|---------|--------|
> | **基建依赖（npm 包）** | 项目安装期 `npm i` | 本清单（DEPENDENCIES.md） |
> | **运行时资源（模型权重）** | 首次 DPS 调用或 `model:download` 预下载 | `check_dps` 降级提示 + CLI 下载命令 |

---

## 一、基建依赖（必须随项目安装）

以下 npm 包是模板脚本（`.add/scripts/mcp-server/` 等）的运行时基建，缺失时对应功能**静默降级或直接报错**：

| 依赖 | 版本 | 用途 | 缺失后果 |
|------|------|------|---------|
| `@huggingface/transformers` | `^3.8.1` | DPS `check_dps` 语义延续性 embedding（`getEmbeddings` 动态 import） | **check_dps 延续性静默降级为 0**（语义分 ×0.6 丢失，不易察觉） |
| `vector-cosine-similarity` | `^1.8.0` | DPS 余弦相似度计算 | check_dps 直接报错 |
| `@modelcontextprotocol/server` | `2.0.0` | MCP 服务器运行 | MCP 工具全部不可用 |
| `zod` | `^4.4.3` | MCP 工具输入 schema（`zod/v4`） | MCP 注册失败 |
| `dotenv` | `*` | 环境变量加载 | 配置缺失、连接失败 |
| `@prisma/client` | `^7.0.0` | ADD-7 审计落库（`shared/prisma.ts`） | 审计不可用 |
| `prisma` | `^7.0.0` | Prisma CLI（generate） | 客户端生成失败 |
| `smol-toml` | `^1.7.0` | caijuehub TOML 转录（`npm run generate`） | 策略转录失败 |
| `tsx` | `>=4` | TS 脚本直接执行（sync/转录/benchmark） | 脚本不可运行 |

> 以上依赖与 add-coder 包本体 `dependencies` 对齐——**安装 add-coder 包即默认获得全部基建**（`npm i add-coder` 自动安装）。本清单服务于**未安装 add-coder 包、仅同步模板脚本**的消费项目。

### 安装命令

```bash
# 消费项目（未安装 add-coder 包本体）：
npm i @huggingface/transformers@^3.8.1 vector-cosine-similarity@^1.8.0 \
  @modelcontextprotocol/server@2.0.0 zod@^4.4.3 dotenv \
  @prisma/client@^7.0.0 prisma@^7.0.0 smol-toml@^1.7.0 tsx@>=4
```

---

## 二、运行时资源（非基建，可延迟）

| 资源 | 获取方式 | 缺失时的行为 |
|------|---------|-------------|
| embedding 模型权重（约 90MB） | `add-coder model:download` 预下载；或首次 DPS 调用自动补下载 | check_dps 降级为纯结构分并提示下载入口（**不阻断**） |

> 基建依赖缺失 ≠ 运行时资源缺失：前者应通过安装解决（本清单），后者通过 `model:download` 解决。check_dps 的降级提示只针对后者。

---

## 三、新增依赖的维护规则

- 模板脚本引入新的 npm 包时，**必须同步更新本清单**（依赖 / 版本 / 用途 / 缺失后果四列）
- 版本号与 add-coder 根 `package.json` 保持一致（`dependencies` 是权威来源，本清单是消费项目视图）
