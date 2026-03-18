# 调研：将大模型替换为豆包（Doubao）

## 概述

豆包（Doubao）是字节跳动旗下的大模型系列，通过**火山方舟**（Volcano Engine Ark）平台提供 API 服务。其 API **完全兼容 OpenAI 格式**，因此集成成本极低。

---

## 豆包 API 基本信息

| 项目 | 内容 |
|------|------|
| 官方平台 | [火山方舟](https://www.volcengine.com/product/ark) |
| API 兼容性 | 完全兼容 OpenAI `/v1/chat/completions` |
| Base URL | `https://ark.cn-beijing.volces.com/api/v3` |
| 认证方式 | API Key (Bearer token) |
| 控制台 | https://console.volcengine.com/ （需实名认证） |

### 主要模型（2025–2026）

| 模型 ID | 说明 | 上下文 |
|---------|------|--------|
| `doubao-1.5-pro-32k` | 旗舰模型，综合能力强 | 32k |
| `doubao-1.5-pro-128k` | 长文本版旗舰 | 128k |
| `doubao-1.5-lite-32k` | 轻量级，性价比高 | 32k |
| `doubao-seed-2-0-pro-260215` | 最新深度思考模型（2026 年） | 256k |

### 价格（参考）

- **Pro-32k**: ~¥0.8 / 百万 token（约 $0.11）
- **Lite-32k**: ~¥0.3 / 百万 token（约 $0.042）
- 比业界平均价格便宜 70%+

---

## 现有架构分析

项目有两套 LLM 集成路径：

### 1. Python 后端（`apps/backend/agent.py`）

通过 `LLM_PROVIDER` 环境变量切换，**已支持 OpenAI 兼容接口**：

```python
# agent.py:344-381
llm_provider = os.getenv("LLM_PROVIDER", "anthropic")

if llm_provider == "anthropic":
    model = ChatAnthropic(...)
else:
    # 任何 OpenAI 兼容接口都走这里
    model = ChatOpenAI(
        model=model_name,
        api_key=api_key,
        base_url=base_url,  # 可配置
        streaming=True,
    )
```

由于豆包 API 完全兼容 OpenAI，**只需修改环境变量**，无需改代码。

### 2. Cloudflare Workers Agent（`apps/agent/src/chat-agent.ts`）

当前使用 `@ai-sdk/anthropic`（Vercel AI SDK），**需要替换** SDK 为 OpenAI 兼容版本。

---

## 集成方案

### 方案一：Python 后端（零代码改动）

仅修改 `.env` 配置：

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=<你的火山方舟 API Key>
OPENAI_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
OPENAI_MODEL=doubao-1.5-pro-32k
```

**注意**：切换后，Claude 专属的 `web_search` 工具（`WEB_SEARCH_TOOL`）将自动禁用（`agent.py:383-386`，仅当 `isinstance(model, ChatAnthropic)` 时启用）。

同样，`title_generator.py` 也会自动走豆包接口（复用 `OPENAI_*` 环境变量），只需把模型名改掉：

```env
# title_generator.py 当前用 gpt-5-nano，可换成豆包轻量模型
OPENAI_MODEL=doubao-1.5-lite-32k
```

---

### 方案二：Cloudflare Workers Agent（需改代码）

当前 `chat-agent.ts` 使用 `@ai-sdk/anthropic`：

```typescript
import { createAnthropic } from "@ai-sdk/anthropic";
```

需要替换为 `@ai-sdk/openai`，并配置自定义 base URL：

**Step 1：安装依赖**
```bash
cd apps/agent
npm install @ai-sdk/openai
```

**Step 2：修改 `chat-agent.ts`**
```typescript
// 替换：
import { createAnthropic } from "@ai-sdk/anthropic";
// 为：
import { createOpenAI } from "@ai-sdk/openai";

// 替换模型初始化：
const doubao = createOpenAI({
  apiKey: env.DOUBAO_API_KEY,
  baseURL: "https://ark.cn-beijing.volces.com/api/v3",
});

const model = doubao("doubao-1.5-pro-32k");
```

**Step 3：更新 `wrangler.toml`**
```toml
[vars]
DOUBAO_MODEL = "doubao-1.5-pro-32k"

[[secrets]]
DOUBAO_API_KEY = "your-api-key"
```

---

## 注意事项

### 工具调用（Function Calling）
豆包支持 Function Calling，与 OpenAI 格式一致，LangChain 的工具调用无需额外改动。

### 流式输出
豆包支持 SSE 流式输出（`stream=True`），与现有 SSE 架构兼容。

### Web Search 工具
目前 `web_search` 是 Claude 原生工具（`web_search_20250305`），切换豆包后此工具不可用。可考虑：
- 通过 [Tavily](https://tavily.com/) 或 [Serper](https://serper.dev/) 实现独立 web search 工具，供所有 provider 共用
- 或直接移除该功能

### 中文支持
豆包在中文理解和生成方面显著优于大多数模型，适合面向中文用户的场景。

### 网络访问
火山方舟 API 位于国内（`ark.cn-beijing.volces.com`），国内服务器直连无需代理。

---

## 建议的迁移步骤

1. **在火山方舟控制台注册**并获取 API Key：https://console.volcengine.com/
2. **先迁移 Python 后端**（零代码改动，只改 env）进行测试
3. 验证 LangGraph agent、工具调用、流式输出正常工作
4. **决策 web_search**：实现独立搜索工具，或暂时禁用
5. **迁移 Cloudflare Worker**：替换 `@ai-sdk/anthropic` 为 `@ai-sdk/openai`

---

## 参考资料

- [火山方舟官网](https://www.volcengine.com/product/ark)
- [模型价格](https://www.volcengine.com/docs/82379/1544106)
- [知乎：豆包API接口兼容OpenAI](https://zhuanlan.zhihu.com/p/715145094)
- [Doubao API 完全指南](https://www.cursor-ide.com/blog/doubao-api-guide)
