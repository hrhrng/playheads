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

## 本地开发

```bash
make dev
```

前端 Vite dev server (`:5173`) + 后端 uvicorn (`:8001`)，不经过 gateway。
