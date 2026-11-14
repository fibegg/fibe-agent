# Mobile agent client contract

All REST paths include `/api`. Guarded REST routes accept `Authorization: Bearer <agentPassword>` (or the existing `token` query parameter); `/ws?token=…&conversation_id=…` uses the same password. Without configured `agentPassword`, guards are open. Use an explicit conversation ID. The new REST prompt-answer route explicitly uses the existing guard. Source audit found that legacy `/api/conversations` routes have no `AgentAuthGuard`, despite the bearer labels in API documentation; this pre-existing auth mismatch is left for coordinator review. Native clients should still send the bearer credential on all requests.

## Contract mapping

The scoped send retains its existing 201 status; the unscoped send retains 202. Existing `requestId` (UUID), `storeGeneration`, `executionState`, `resolvedPolicy`, upload `filename`, history `imageUrls` / `attachmentFilenames`, and prompt `questionId` remain supported. Obtain `{ deliveryScope: { accepted: true, conversationId, storeGeneration } }` from `GET /api/agent/status?deliveryScope=true&conversationId=<id>` before an identified send. Persist that scope and the exact payload for retries. `questionId` is the existing prompt identity; `promptId` exposes the same UUID additively.

## Sends and Stop response

`POST /api/agent/send-message` (202) or `POST /api/conversations/:id/agent/send-message` (201, existing Nest default):

```json
{"text":"","conversationId":"…","images":["stored.png"],"attachmentFilenames":["stored.pdf"],"busyPolicy":"steer","requestId":"<UUID>","storeGeneration":"<UUID>"}
```

All body fields are optional; scoped routes use the path ID. `text` may be absent/blank with existing uploaded images/documents in this conversation or image `data:` URLs. Entirely empty requests return 400 with the existing text-required message. For attachment-only sends, missing/unsafe upload identities return 400. Text-bearing requests retain their existing upload validation/acceptance behavior. REST image-only sends and existing WebSocket sends accept image data URLs. Policy is `reject` (default), `queue`, or `steer`.

Success: `{ accepted: true, messageId, conversationId?, resolvedPolicy?, executionState?, resolution: "started" | "steered" | "queued", fallbackReason? }`. Only handled immediate steering reports `steered`. When a provider retains the complete steer prompt for its next turn, the queued execution carries no duplicate image/document/audio context; persisted message attachments remain unchanged. A queued steer fallback reports `queued`, with `steer_unsupported_content` for unsupported attachments, `steer_unsupported` when no steer method exists, or `steer_queued` when the provider queues/restarts rather than immediately handling it.

Same request UUID and semantic body replay the original admission identity and resolution without executing again; the existing `executionState` continues to report current execution progress. Different body: the existing 409 `{ "error": "REQUEST_ID_CONFLICT", "messageId"?: "…" }`. Contract mapping: logical `request_conflict` retains the existing `REQUEST_ID_CONFLICT` spelling; clients should recognize this existing error. Identity includes text, conversation, ordered images/documents and busy policy. Existing 409 `{ error: "STORE_GENERATION_CHANGED", messageId }` and `{ error: "REQUEST_OUTCOME_UNKNOWN", messageId }` remain: never automatically create a replacement request after these errors. Other send errors retain Nest envelopes: 400 `{ statusCode: 400, message: "text is required and must be non-empty", error: "Bad Request" }` or the same envelope with `message: "Uploaded file not found"`; provider auth is 403 `{ statusCode: 403, message: "NEED_AUTH", error: "Forbidden" }`; missing conversation is 404 `{ statusCode: 404, message: "Conversation not found", error: "Not Found" }`; busy rejection is 409 `{ statusCode: 409, message: "<busy reason>", error: "Conflict" }`. Guard rejection is 401 with the existing Unauthorized envelope. DTO validation remains 400 with Nest's message array.

Successful receipts are persisted on existing user messages for as long as that conversation's current history remains; reset/deletion or caller-message cancellation rotates the store generation. In-flight admissions are memory-only and removed on settlement. Only permanent validation rejections (invalid body or unknown uploaded file) are cached in process memory, bounded to the latest 1000 receipts; transient rejections such as busy/auth/conversation availability are re-evaluated on retry; entirely empty HTTP bodies retain their existing immediate 400 validation before admission; eviction or process restart ends their replay retention. Legacy receipts lacking a saved outcome retain existing execution-state recovery behavior.

`POST /api/agent/interrupt` or `/api/conversations/:id/agent/interrupt` interrupts the response only; unchanged response. `DELETE /api/conversations/:id/queue/:turnId` cancels queued work; existing response unchanged.

## Uploads and history

`POST /api/uploads?conversationId=<id>` multipart file: existing `{ filename }` plus `{ storedFilename, originalFilename, mediaType, size, kind }`, where `kind` is `image` or `document` and `size` is bytes. Existing type policy and 20 MiB limit remain: blocked types are 400 `Unsupported or blocked file type`; oversized multipart files are 413 `FST_REQ_FILE_TOO_LARGE`. Download via authenticated `GET /api/uploads/:filename?conversationId=<id>`.

`GET /api/conversations/:id/messages` and `/api/messages` retain array responses and gain per-message `attachments: [{ storedFilename, originalFilename, mediaType?, size?, kind }]`. Metadata is persisted beside uploaded files and in message history. Old records without metadata are returned unchanged: clients use the stored filename from `imageUrls` / `attachmentFilenames` when attachment metadata or originalFilename is absent. No metadata is synthesized into legacy messages. Existing filename arrays remain authoritative upload identities.

## Recoverable prompts

`GET /api/conversations/:id/live` retains all existing live fields and adds `pendingPrompts: [{ promptId, questionId, kind: "question", question, placeholder } | { promptId, questionId, kind: "confirmation", message, confirmLabel, cancelLabel }]` (conversationId may also be included). Prompts with no conversationId are included in every conversation snapshot and can be answered from any conversation; only prompts with an explicit conversationId enforce that scope. Prompts survive socket reconnect, until answered, timeout, or runtime shutdown; they are not durable across runtime restart.

Prompt events `ask_user_prompt` / `confirm_action_prompt` include identical `promptId` and legacy `questionId`. Answer with WebSocket `answer_user_question` `{ promptId, answer }` or `confirm_action_response` `{ promptId, confirmed }`; legacy `questionId` is accepted as the same identity. REST: `POST /api/conversations/:id/prompts/:promptId/answer` with `{ answer: string }` or `{ confirmed: boolean }` returns 200 `{ accepted: true }`. Unknown, expired, wrong-conversation, wrong-kind, or already answered IDs return 409 `{ error: "stale_prompt" }`; WebSocket replies use `error` events with `error: "stale_prompt", statusCode: 409`. Web refreshes live state on stale errors.

## Sequencing and reconnect

Live snapshots include `streamId: string` and `revision: number`. `stream_start`, `stream_chunk`, `stream_end`, and `queue_updated` events carry the same fields. Revisions increase per conversation per emitted event; snapshots read the last emitted revision. The stream identity is stable for a runtime's conversation sequencing epoch, changing after runtime restart or conversation deletion/recreation (revisions restart at zero). Gemma-routed CLI streams use the same sequencing and conversation broadcasts. Subscribe and buffer, fetch history/live, then apply only events in that epoch newer than the snapshot. A changed stream identity requires a fresh snapshot. There is no replay cursor. At stream end, refresh history and deduplicate by persisted message ID.


## Models, effort and model lock

`GET /api/runtime-config` is public and preserves its existing response fields, adding `lockChatModel: boolean`. It is `truthy(process.env.LOCK_CHAT_MODEL)`: trimmed, case-insensitive `1`, `true` or `yes` is true; absent/other values are false. A locked client disables model selection. Existing clients may ignore the field; clients talking to older runtimes decode it as optional.

Model choices remain the existing string array from authenticated `GET /api/model-options`; no new model-options shape. Existing WebSocket `get_model` / `set_model` `{ model: string }` and `model_updated` are unchanged. Effort uses the fixed shared `EFFORT_OPTIONS` list: `low`, `medium`, `high`, `xhigh`, `max`, exactly as web chat. Use existing WebSocket `get_effort` / `set_effort` `{ effort: string }` and `effort_updated`; there is no new effort-capability endpoint.

Sequencing fields are additive. Existing live fields (`isProcessing`, `currentActivityId`, `finishedAt`) retain their existing meaning and finalization timing, including the short persistence-settlement interval after stream_end. Existing download URLs and Content-Disposition headers are unchanged; clients select display/export names from attachment metadata.
