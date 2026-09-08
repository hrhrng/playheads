# Client queue tools

`add_to_queue` is declared on the agent without `execute`. The browser handles it
through `useAgentChat.onToolCall`, awaits MusicKit, and returns a JSON receipt via
`addToolOutput`. The SDK then continues the model with the actual result.

## Best effort

- `usePlayQueue.addTrackIds` attempts IDs individually, in request order.
- Each accepted track must be present as a new occurrence in the native queue.
- One unresolvable ID does not prevent later tracks from being added.
- The result contains `tracks` (confirmed metadata) and `failed` (ID and error).
- `ok` means at least one addition succeeded; `partial` means some failed.
- An all-failed result has `ok: false` and renders as an error in the chat.
- Failures are normal tool outputs, rather than SDK `output-error`, because the
  installed SDK disables automatic continuation for `output-error`.
- The model is instructed to search replacements only for failures, without
  re-adding accepted tracks or claiming an inferred total queue size.

On continuation, only confirmed tracks are appended to the conversation's topic
playlist. Existing entries are deduplicated by ID. The global queue continues to
sync from MusicKit through the existing queue sync hook.

`play_track`, `skip_next`, and `remove_from_playlist` still use legacy server
`_action` dispatch. The browser retains the old add-action handler for old-server
compatibility; new add calls no longer emit these events. Deploy web before agent
if deploying separately, so the client handler exists before the server uses it.

## Incident and verification

On 2026-09-08, the live browser logged `NOT_FOUND: One or more items could not be
resolved: 1556175857` for a four-song batch. The server had already returned
"Added 4 tracks to queue" while the provider swallowed the rejection. This is
why repeating the same request continued to claim success without adding songs.

Regression tests cover rejection propagation, usable mutation queues after a
failure, unavailable players, awaiting acknowledgement, partial receipts,
per-song isolation, refreshing the queue without an SDK event, and confirmed-only
topic history. Run:

```sh
pnpm --filter web test src/providers/__tests__/queue.test.ts src/hooks/__tests__/usePlayQueue.test.ts src/hooks/__tests__/useAgentChatAdapter.test.ts tests/musicToolContract.test.ts
pnpm --filter web build
pnpm --filter playheads-agent exec wrangler deploy --dry-run
```

These checks use a controlled MusicKit boundary; they do not prove production
rollout or real playback. Validate one unavailable ID mixed with valid IDs in the
browser after deployment, checking both the queue and the model's partial result.

## Deployment prerequisite

The 2026-09-08 production run reached web and agent deployment but failed on the
gateway's automatic R2 provisioning check (Cloudflare 10000). Both gateway CI
deploy commands use `--no-x-provision`: the configured bucket, D1 database and
KV namespace already exist, so deployment should bind those resources without
requiring resource creation/management permissions. Keep the explicit names/IDs.
See [Cloudflare automatic provisioning](https://developers.cloudflare.com/changelog/post/2025-10-24-automatic-resource-provisioning/).
