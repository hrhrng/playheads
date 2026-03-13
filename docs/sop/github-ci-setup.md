# GitHub CI 环境配置 SOP

CI 通过 GitHub Actions 自动构建和部署。需要在 GitHub 上配置 Secrets 和 Variables。

## 1. 创建 Cloudflare API Token

1. 登录 https://dash.cloudflare.com/profile/api-tokens
2. 点击 **Create Token**
3. 选择 **Custom token**
4. 配置权限：
   - **Account** → Workers Scripts → **Edit**
   - **Zone** → Workers Routes → **Edit**（production 自定义域名需要）
5. Account Resources → 选择你的账号
6. 点击 **Continue to summary** → **Create Token**
7. 复制 Token（只显示一次）

## 2. 获取 Cloudflare Account ID

1. 登录 https://dash.cloudflare.com
2. 右侧边栏可以看到 **Account ID**
3. 复制备用

## 3. 获取 Workers 子域名

1. 左侧菜单 → **Workers & Pages**
2. 页面中可以看到你的子域名格式：`<name>.<subdomain>.workers.dev`
3. 记录 `<subdomain>` 部分（preview 环境用）

## 4. 配置 GitHub Secrets

1. 打开 GitHub 仓库 → **Settings** → **Secrets and variables** → **Actions**
2. 点击 **Secrets** tab → **New repository secret**，添加：

| Secret 名称 | 值 | 说明 |
|-------------|-----|------|
| `CLOUDFLARE_API_TOKEN` | 步骤 1 中创建的 token | CI 部署凭证 |
| `CLOUDFLARE_ACCOUNT_ID` | 步骤 2 中的 Account ID | Cloudflare 账号标识 |

## 5. 配置 GitHub Variables

1. 同一页面，切换到 **Variables** tab → **New repository variable**，添加：

| Variable 名称 | 值 | 说明 |
|---------------|-----|------|
| `VITE_SUPABASE_URL` | `https://djwbwwuipjdpeppbbspd.supabase.co` | Supabase 项目 URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key | Supabase 匿名密钥 |
| `CF_WORKERS_SUBDOMAIN` | 步骤 3 中的子域名 | 用于拼 preview URL |
| `PRODUCTION_DOMAIN` | `playheads.com` | 生产环境域名 |

> Variables（非 Secrets）用于非敏感的构建时变量。Supabase anon key 是公开的，放 Variables 即可。

## 6. 配置 Production Environment（可选）

如需 production 部署审批：

1. **Settings** → **Environments** → **New environment**
2. 名称填 `production`
3. 可配置：
   - **Required reviewers** — 部署前需审批
   - **Wait timer** — 部署延迟
4. Production 环境的 secrets/variables 会继承 repo 级别的配置

## 验证

- 提交 PR → 触发 `Deploy Preview` → 评论区出现 preview URL
- 合并到 main → 触发 `Deploy Production` → 部署到 playheads.com
