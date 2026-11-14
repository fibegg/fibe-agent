# Mobile agent client contract

All REST paths include `/api`. Guarded REST routes accept `Authorization: Bearer <agentPassword>` (or the existing `token` query parameter); `/ws?token=…&conversation_id=…` uses the same password. Without configured `agentPassword`, guards are open. Use an explicit conversation ID.

## Contract mapping

Existing `requestId` (UUID), `storeGeneration`, `executionState`, `resolvedPolicy`, upload `filename`, history `imageUrls` / `attachmentFilenames`, and prompt `questionId` remain supported. Obtain `{ deliveryScope: { accepted: true, conversationId, storeGeneration } }` from `GET /api/agent/status?deliveryScope=true&conversationId=<id>` before an identified send. Persist that scope and the exact payload for retries. `questionId` is the existing prompt identity; `promptId` exposes the same UUID additively.

## Sends and Stop response

`POST /api/agent/send-message` (202) or `POST /api/conversations/:id/agent/send-message` (202):

```json
{"text":"","conversationId":"…","images":["stored.png"],"attachmentFilenames":["stored.pdf"],"busyPolicy":"steer","requestId":"<UUID>","storeGeneration":"<UUID>"}
```

All body fields are optional; scoped routes use the path ID. `text` may be absent/blank only with existing uploaded images/documents in this conversation. Entirely empty requests return 400 with the existing text-required message. Missing/unsafe upload identities return 400. Existing WebSocket image data URLs remain supported. Policy is `reject` (default), `queue`, or `steer`.

Success: `{ accepted: true, messageId, conversationId?, resolvedPolicy?, executionState?, resolution: "started" | "steered" | "queued", fallbackReason? }`. Only handled immediate steering reports `steered`. A queued steer fallback reports `queued`, with `steer_unsupported_content` for unsupported attachments, `steer_unsupported` when no steer method exists, or `steer_queued` when the provider queues/restarts rather than immediately handling it.

Same request UUID and semantic body replay the original admission outcome without executing again. Different body: 409 `{ "error": "request_conflict" }`. Identity includes text, conversation, ordered images/documents and busy policy. Existing 409 `{ error: "STORE_GENERATION_CHANGED", messageId }` and `{ error: "REQUEST_OUTCOME_UNKNOWN", messageId }` remain: never automatically create a replacement request after these errors. 403 `NEED_AUTH`, 404 conversation not found, and 409 busy rejection retain existing envelopes.

Successful receipts are persisted on existing user messages for as long as that conversation's current history remains; reset/deletion rotates the store generation. In-flight admissions are memory-only and removed on settlement. Rejected admissions are cached in process memory, bounded to the latest 1000 receipts; eviction or process restart ends their replay retention. Legacy receipts lacking a saved outcome retain existing execution-state recovery behavior.

`POST /api/agent/interrupt` or `/api/conversations/:id/agent/interrupt` interrupts the response only; unchanged response. `DELETE /api/conversations/:id/queue/:turnId` cancels queued work; existing response unchanged.

## Uploads and history

`POST /api/uploads?conversationId=<id>` multipart file: existing `{ filename }` plus `{ storedFilename, originalFilename, mediaType, size, kind }`, where `kind` is `image` or `document` and `size` is bytes. Existing type policy and 20 MiB limit remain. Download via authenticated `GET /api/uploads/:filename?conversationId=<id>`.

`GET /api/conversations/:id/messages` and `/api/messages` retain array responses and gain per-message `attachments: [{ storedFilename, originalFilename, mediaType?, size?, kind }]`. Metadata is persisted beside uploaded files and in message history. For legacy records, `originalFilename` falls back to `storedFilename`, with unknown media type/size omitted. Existing filename arrays remain authoritative upload identities.

## Recoverable prompts

`GET /api/conversations/:id/live` retains all existing live fields and adds `pendingPrompts: [{ promptId, questionId, kind: "question", question, placeholder } | { promptId, questionId, kind: "confirmation", message, confirmLabel, cancelLabel }]` (conversationId may also be included). Prompts survive socket reconnect, until answered, timeout, or runtime shutdown; they are not durable across runtime restart.

Prompt events `ask_user_prompt` / `confirm_action_prompt` include identical `promptId` and legacy `questionId`. Answer with WebSocket `answer_user_question` `{ promptId, answer }` or `confirm_action_response` `{ promptId, confirmed }`; legacy `questionId` is accepted as the same identity. REST: `POST /api/conversations/:id/prompts/:promptId/answer` with `{ answer: string }` or `{ confirmed: boolean }` returns 200 `{ accepted: true }`. Unknown, expired, wrong-conversation, wrong-kind, or already answered IDs return 409 `{ error: "stale_prompt" }`; WebSocket replies use `error` events with `error: "stale_prompt", statusCode: 409`. Web refreshes live state on stale errors.

## Sequencing and reconnect

Live snapshots include `streamId: string` and `revision: number`. `stream_start`, `stream_chunk`, `stream_end`, and `queue_updated` events carry the same fields. Revisions increase per conversation per emitted event; snapshots read the last emitted revision. The stream identity is stable for a runtime's conversation sequencing epoch, changing after runtime restart (revisions restart at zero). Subscribe and buffer, fetch history/live, then apply only events in that epoch newer than the snapshot. A changed stream identity requires a fresh snapshot. There is no replay cursor. At stream end, refresh history and deduplicate by persisted message ID.
