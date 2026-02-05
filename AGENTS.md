# Repository Guidelines

## Project Structure & Module Organization
- Root workspace uses npm workspaces for `backend/` and `frontend/`.
- `backend/src/` contains Express API, services, and types; `backend/tests/` holds unit, integration, and property tests.
- `frontend/src/` contains React components, pages, and client utilities.
- `memory/` stores user data as Markdown with YAML frontmatter and is treated as a Git-tracked data store.
- `docs/` contains product and API documentation; `second-brain-product-vision.md` is the product vision.

## Build, Test, and Development Commands
- `npm install` installs workspace dependencies.
- `npm run dev` starts the backend (`tsx watch`).
- `npm run dev:frontend` starts the Vite frontend.
- `npm run build` builds both workspaces.
- `npm test` runs all workspace tests; `npm run test:backend` runs backend tests only.
- `cd backend && npm run test:coverage` runs Jest coverage.
- `npm run docker:up` starts the full Docker stack; `docker compose up -d db` starts just PostgreSQL.
- Any app changes require a Docker rebuild and redeploy: `docker compose up -d --build`.
- Always run database migrations outside the sandbox (escalated command).

## Coding Style & Naming Conventions
- TypeScript across backend and frontend; follow existing patterns and ESLint rules.
- Backend files use kebab-case with suffixes like `*.service.ts`, `*.route.ts`, `*.test.ts`.
- React components use PascalCase files (e.g., `MessageList.tsx`).
- Prefer small, focused modules and keep API/DB logic in `backend/src/services/`.

## Testing Guidelines
- Jest is the primary test runner; property tests use `fast-check`.
- Test files live in `backend/tests/{unit,integration,property}` and end in `.test.ts`.
- Add or update tests for new API routes, tools, or entry behaviors.

## Commit & Pull Request Guidelines
- Commit messages are short and descriptive; some history uses numeric prefixes (e.g., `006 email channel`).
- Prefer imperative, single‑line subjects (e.g., `fix task status updating`).
- PRs should include: summary of changes, test commands run, and screenshots for UI changes.

## Security & Configuration Tips
- Copy `.env.example` to `.env` and set `OPENAI_API_KEY`, `DATABASE_URL`, `API_KEY`, and `DATA_PATH`.
- Email integration is optional and only enabled when all SMTP/IMAP vars are set.
