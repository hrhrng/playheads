# 部署 SOP

## 架构

```
用户 → gateway (Cloudflare Worker)
         ├── /api/*  → BackendContainer (Docker, FastAPI)
         └── /*      → web (Cloudflare Worker, 静态资源 + SPA)
```

两个 Cloudflare Worker + 一个 Container：
- **playheads-web**：服务前端静态资源
- **playheads-gateway**：入口路由，通过 Service Binding 调用 web，通过 Container 调用后端

## 环境

| 环境 | 域名 | 触发方式 |
|------|------|----------|
| Preview | `playheads-gateway.<subdomain>.workers.dev` | PR 创建/更新 |
| Production | `playheads.com` | 合并到 main |

## 首次部署

### 1. 配置 Cloudflare Secrets

后端环境变量，参考 [cloudflare-secrets.md](./cloudflare-secrets.md)

### 2. 配置 GitHub CI

CI 所需的 Secrets 和 Variables，参考 [github-ci-setup.md](./github-ci-setup.md)

### 3. 配置自定义域名（Production）

1. 在 Cloudflare 添加 `playheads.com` 为 Zone
2. DNS 由 Cloudflare 管理
3. gateway 的 `wrangler.toml` 已配置 `[env.production]` 的 custom_domain

### 4. 触发部署

- **Preview**：提 PR 即可
- **Production**：合并 PR 到 main

## 日常部署

代码合并到 main 后自动部署，无需手动操作。

## 回滚

```bash
# 查看部署历史
cd apps/gateway && npx wrangler deployments list

# 回滚到指定版本
cd apps/gateway && npx wrangler rollback <deployment-id>
```

## 监控

- **Cloudflare Dashboard** → Workers & Pages → playheads-gateway → Logs
- **健康检查**：`GET https://playheads.com/api/health`
- Worker 层：自动采集请求日志、延迟、错误率
- Container 层：JSON 结构化日志（stdout）

## Voice Agent 排障

- `@cloudflare/voice` 会在 `onCallStart()` 之前先解析 `createTranscriber() ?? this.transcriber`。
- 如果要动态创建 STT provider，必须实现 `createTranscriber()`；只在 `onCallStart()` 里初始化已经太晚了。
- `apps/agent/wrangler.toml` 和 `apps/agent/wrangler.preview.toml` 都必须声明 `[ai] binding = "AI"`，否则 voice call 会在开始阶段直接报 `No transcriber configured`。
- 不要轻易对 Durable Object 加 `deleted_classes` 迁移。分支 preview worker 的历史版本可能从来没导出过那个类，Cloudflare 会直接拒绝部署。
- 看到这个错误时，先看 agent worker 日志里有没有 `[Voice][diag] invalid AI binding`。这条日志会把 `env.AI` 的 runtime 形状打出来，用来区分“库接入时序错了”和“AI binding 根本没进来”。
- 部署前至少跑一次：

```bash
pnpm --filter playheads-agent exec wrangler deploy --dry-run
```

## 本地开发

```bash
make dev
```

前端 Vite dev server (`:5173`) + 后端 uvicorn (`:8001`)，不经过 gateway。
