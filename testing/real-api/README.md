# Real API Scenario Tests

Purpose: keep reusable, live end-to-end checks against the running backend (`/api/chat`, `/api/search`, `/api/entries`) using real model responses.

## Prerequisites

- Backend reachable (default `http://localhost:3000`).
- Valid login credentials via env vars:
  - `REAL_API_EMAIL` and `REAL_API_PASSWORD`
  - or fallback `DEFAULT_USER_EMAIL` and `DEFAULT_USER_PASSWORD`

## Run

```bash
node testing/real-api/run-chat-scenarios.mjs
```

Custom scenario file:

```bash
node testing/real-api/run-chat-scenarios.mjs testing/real-api/scenarios/mutation-reliability.json
```

Extended flow (includes delete verification and may be more model-sensitive):

```bash
node testing/real-api/run-chat-scenarios.mjs testing/real-api/scenarios/mutation-extended.json
```

Optional env vars:

- `REAL_API_BASE_URL` (default: `http://localhost:3000`)
- `REAL_API_RUN_ID` (default: generated timestamp)

## Scenario Format

`steps[]` supports:

- `type: "chat"`: sends `POST /api/chat`
  - `message`, optional `continueConversation: false`
  - `expect.toolsUsedIncludes[]`, `expect.entryCategory`, `expect.clarificationNeeded`
  - `expect.messageContainsAll[]`, `expect.messageContainsAny[]`
- `type: "search"`: sends `GET /api/search`
  - `query`, optional `category`
  - `expect.minResults`, `expect.maxResults`
  - `expect.includesName`, `expect.includesStatus`, `expect.includesCategory`
- `type: "entry"`: sends `GET /api/entries/:path`
  - `path`
  - `expect.category`, `expect.status`, `expect.nameIncludes`, `expect.notFound`

State helpers:

- `save`: map response JSON paths to runtime variables (example: `"ENTRY_PATH": "entry.path"`).
- `{{RUN_ID}}` plus saved vars can be reused in later steps.
- `autoConfirmCapture: true` sends a follow-up confirmation when the assistant asks to confirm capture.

Template placeholders like `{{RUN_ID}}` are expanded automatically.
