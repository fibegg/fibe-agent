# API

Nest Fastify API (project `api`).

**Base URL:** `http://localhost:3000/api` (when served with `nx serve api`).

## Endpoints

| Method | Path           | Auth   | Description                                              |
|--------|----------------|--------|----------------------------------------------------------|
| GET    | /api           | No     | Returns `{ message: 'Hello API' }`                      |
| POST   | /api/login     | No     | Body `{ password? }`. Returns `{ success, message?, token? }` or 401 |
| GET    | /api/messages  | Bearer | Returns array of messages (stub: `[]`)                   |
| GET    | /api/model-options | Bearer | Returns array of model option strings from env          |

When `AGENT_PASSWORD` is set, `GET /api/messages` and `GET /api/model-options` require `Authorization: Bearer <password>` or `?token=<password>`.
