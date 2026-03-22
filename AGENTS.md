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

# Doc
docs guid:
1.