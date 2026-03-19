# Phoenix Agent (Nx)

Nx monorepo: **api** (NestJS + Fastify) and **chat** (React + Vite). The API runs the agent (Gemini, Claude Code, OpenAI Codex, or mock); the chat app is the UI.

## Run API + Chat

Use **Bun** for fastest installs and script runs (`bun install`, `bun run dev`). npm works too.

**Quick dev** (API + chat in parallel): `bun run dev`

Or start separately:

1. **Start the API** (port 3000):

   ```sh
   bunx nx serve api
   ```

   Set `AGENT_PROVIDER=mock` if you don’t have a provider CLI installed:

   ```sh
   AGENT_PROVIDER=mock bunx nx serve api
   ```

2. **Start the chat app** (port 3100):

   ```sh
   bunx nx serve chat
   ```

   With the default Vite proxy, the chat app will use `http://localhost:3000` for `/api` and `/ws`. If the API runs on another host/port, set:

   ```sh
   API_URL=http://localhost:3000
   ```

3. Open **http://localhost:3100**. If `AGENT_PASSWORD` is set, log in with that password first, then use the chat.

## Environment

Copy `.env.example` to `.env` and adjust. Main variables:

- **API:** `PORT`, `AGENT_PASSWORD`, `AGENT_PROVIDER` (mock, gemini, claude-code, openai-codex, opencode), `MODEL_OPTIONS`, `DATA_DIR`, `SYSTEM_PROMPT_PATH`
- **Chat:** `API_URL` (only if the API is not on the same origin or not proxied), `LOCK_CHAT_MODEL` (optional; when set, the model selector is disabled and only shows the model in use), `ASSISTANT_AVATAR_URL` (optional; URL for the assistant’s avatar), `USER_AVATAR_URL` (optional; URL for the user’s avatar)

## Project layout

- `apps/api` – NestJS API, WebSocket at `/ws`, REST under `/api`
- `apps/chat` – React chat UI (login, chat, auth modal, model selector)
- `apps/e2e-api`, `apps/e2e-chat` – Playwright / Bun e2e (named so `bun test apps/api` does not pick up e2e specs by prefix)
- `docs/API.md` – REST and WebSocket contract

## Scripts

| Script       | Command        | Description                    |
|-------------|----------------|--------------------------------|
| **dev**     | `bun run dev`  | API + chat in parallel         |
| **build**   | `bun run build`| Build all apps                 |
| **lint**    | `bun run lint` | Lint all projects              |
| **test**    | `bun run test` | Run unit tests                 |
| **typecheck** | `bun run typecheck` | Type-check all projects |
| **e2e**     | `bun run e2e`  | Run E2E tests                  |
| **ci**      | `bun run ci`   | Lint, test, build, typecheck, e2e (CI pipeline) |

GitHub Actions CI uses Bun and runs `bun run ci`. For reproducible CI, run `bun install` locally once and commit `bun.lock`, then the workflow can use `bun install --frozen-lockfile` in the test job.
