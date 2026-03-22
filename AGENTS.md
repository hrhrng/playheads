There are Behavior、Doc、, all of them setted as a title

# Behavior
Every character matters, check /docs if something makes you confues
when you write new doc, maintain the index below continuously
when you find something worth to remember, update the docs or create a docs
when you modify something related to docs, update the doc as needed
* when you push something to remote, please waiting for ALL CI/CD checks (including deploy) to complete before reporting results. Use `gh run watch <id> --exit-status` to block until finished. Never report partial results as done.
update behavior as need continuously
* **NEVER** clean up or delete a git worktree that has uncommitted changes. Always commit and push your work to the remote branch BEFORE exiting or cleaning up a worktree. Losing uncommitted work in a deleted worktree is unrecoverable.

# Bitter Lessons (LLM Provider Integration)

Things that went wrong during the multi-provider LLM refactor. Read this before touching LLM routing code.

1. **Never guess model IDs.** Always check the provider's official docs for exact model ID strings. Wrong examples: `grok-4.20-reasoning` (correct: `grok-4.20-beta-latest-reasoning`), `doubao-seed-2.0-pro-260215` (correct: `doubao-seed-2-0-pro-260215`). One wrong character = 400 Bad Request.

2. **Test before push, every time.** At minimum do a dry-run build (`wrangler deploy --dry-run`). Ideally hit the actual endpoint. Never push code and let the user discover it's broken from prod logs.

3. **Don't touch auth that already works.** CF AI Gateway auth is fragile and poorly documented. Native providers (anthropic, xai, openai) just need `Authorization: Bearer CF_AIG_TOKEN`. Custom providers (custom-*) also just need `Authorization: Bearer CF_AIG_TOKEN` when BYOK is configured in CF dashboard. Adding `cf-aig-authorization` header broke everything. Only add it when the user explicitly provides their own provider API key in admin.

4. **`console.log` format strings don't work in Workers.** `console.log("card=%s", val)` prints literal `%s`. Use template literals or `JSON.stringify`.

5. **Provider-specific param formats matter.** Each provider has its own thinking/reasoning param shape. Don't assume camelCase — x.ai uses `reasoning_effort` (snake_case). Doubao uses `reasoning_effort` not `thinking.type: "auto"`. Always check the provider's API docs.

6. **CI/CD secret sync is a silent killer.** If a secret (like `CF_AIG_TOKEN`) isn't in the deploy workflow's sync step, the worker gets no value and fails silently or with cryptic errors. Check both `deploy-preview.yml` and `deploy-production.yml` when adding secrets to any worker.

7. **Admin test endpoint must use the exact same code path as the agent.** Duplicated LLM routing logic will drift. Extract shared code (`createLLMModel` in `@playheads/llm-config`) so test and production always behave identically.

8. **Don't over-engineer auth branches.** The initial design had own-key vs BYOK vs custom-provider vs native-provider branching. Reality: just `Authorization: CF_AIG_TOKEN` for everything, plus `cf-aig-authorization` only when user fills in their own key. Two branches, not four.

# New Model Onboarding Checklist

Standard procedure for adding a new LLM provider/model. Do every step, in order. Don't skip.

## 1. Research (before writing any code)

- [ ] Go to the provider's **official API docs**. Not blog posts, not tutorials — the API reference.
- [ ] Confirm the **exact model ID** string (copy-paste, don't type by hand). Watch for dots vs hyphens, version suffixes, `-latest` vs dated snapshots.
- [ ] Check **thinking/reasoning params**: what's the field name (snake_case? camelCase?), what values does it accept, is it per-model or global. Some models have built-in reasoning with no toggle.
- [ ] Note **max output tokens** — both normal and with-thinking. Some providers reject requests if `maxTokens` exceeds their limit.
- [ ] Check if the provider is **OpenAI-compatible** (most are) or needs a dedicated SDK.
- [ ] Find the **base URL** for the API (e.g. `https://api.x.ai/v1`, `https://ark.cn-beijing.volces.com/api/v3`).

## 2. CF AI Gateway Setup

- [ ] Check if the provider is a **native gateway provider** (anthropic, openai, xai, etc.) — if so, the `gatewayPathSegment` is just the provider name (e.g. `"xai"`).
- [ ] If not native, create a **custom provider** in CF dashboard: slug = `doubao` → gateway path = `custom-doubao`, base_url = the provider's API root.
- [ ] Configure **BYOK** in CF dashboard → AI Gateway → Provider Keys: add the provider's API key. This lets the gateway inject it so our code only needs `CF_AIG_TOKEN`.
- [ ] **Test in CF dashboard playground** first — send a minimal chat completion request. If it fails here, don't bother with code changes.

## 3. Auth Rules (don't deviate)

All traffic goes through CF AI Gateway. Two modes:

| Mode | `Authorization` header | `cf-aig-authorization` header |
|------|----------------------|------------------------------|
| **BYOK** (no API key in admin) | `Bearer CF_AIG_TOKEN` | not sent |
| **Own key** (user fills key in admin) | `Bearer <provider_key>` | `Bearer CF_AIG_TOKEN` |

That's it. No other combinations. Native and custom providers both follow this.

## 4. Code Changes

- [ ] Add `ModelCard` to `packages/llm-config/src/index.ts` with: `id`, `label`, `group`, `sdk`, `sdkName`, `modelId`, `defaultBaseUrl`, `gatewayPathSegment`, `thinking` (with correct params shape or `false`), `paramsSchema`, `maxOutputTokens`, `maxOutputTokensWithThinking`.
- [ ] No changes needed in `resolve-llm.ts` or `createLLMModel` — model cards drive everything.
- [ ] If a new secret is needed, add it to **both** `deploy-preview.yml` and `deploy-production.yml` secret sync steps.

## 5. Verify

- [ ] `wrangler deploy --dry-run` for both agent and admin — must pass.
- [ ] Admin panel: create resource with new model, hit **Test** button.
- [ ] Bind to Chat caller, send a message, check CF worker logs for `createLLMModel` event.
- [ ] If thinking/reasoning is supported: test with params on AND off.

# Doc
docs guid:
1.