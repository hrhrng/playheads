# Cloudflare Secrets 设置 SOP

后端环境变量通过 Cloudflare Secrets 管理，设置后存在 Cloudflare 加密存储中，运行时注入到 Worker → Container。

## 方式一：Cloudflare Dashboard（推荐）

1. 登录 https://dash.cloudflare.com
2. 左侧菜单 → **Workers & Pages**
3. 点击 **playheads-gateway**
4. 顶部 tab → **Settings**
5. 左侧 → **Variables and Secrets**
6. 点击 **Add** 添加以下变量，Type 选 **Secret**：

| 变量名 | 说明 |
|--------|------|
| `DATABASE_URL` | PostgreSQL 连接串（Supabase） |
| `ANTHROPIC_API_KEY` | Anthropic API 密钥 |
| `OPENAI_API_KEY` | OpenAI API 密钥 |
| `OPENAI_BASE_URL` | OpenAI API 地址（如用代理） |
| `APPLE_MUSIC_TEAM_ID` | Apple Developer Team ID |
| `APPLE_MUSIC_KEY_ID` | Apple Music Key ID |
| `APPLE_MUSIC_PRIVATE_KEY` | Apple Music 私钥（PEM 内容，直接粘贴） |
| `APPLE_MUSIC_WEB_TOKEN` | 可选。Apple Music Web bearer token override；不设置时 agent 会从 `music.apple.com` 前端资源动态提取，用于 Apple private lyrics 链路 |
| `MINIMAX_API_KEY` | Minimax TTS API 密钥 |

7. 点击 **Encrypt** 保存每个变量
8. 点击页面底部 **Deploy** 使变量生效

## 方式二：CLI

```bash
make deploy-secrets
```

会逐个提示输入值。适合脚本化或首次批量设置。

## 注意

- Secrets 设置一次即可，后续部署自动携带
- 修改 secret 后需要重新部署 gateway 才生效
- `APPLE_MUSIC_PRIVATE_KEY` 是多行 PEM，Dashboard 中直接粘贴全文即可
- Agent lyrics 开关是 Worker var `APPLE_LYRICS_SOURCE`，支持 `apple-first`、`lrclib-first`、`off`；默认 preview/prod 配置为 `apple-first`
