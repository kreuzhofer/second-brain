# CLAUDE.md — JustDo.so

## What is this?
AI-powered personal knowledge management system. Full-stack TypeScript monorepo (Express + React) with PostgreSQL/pgvector, OpenAI integration, and Docker deployment.

## Project Layout
```
backend/          Express API (TypeScript, Prisma ORM, Jest)
frontend/         React 18 + Vite + Tailwind (Vitest)
docs/             Product vision, API docs, roadmap
testing/real-api/ Live API test harness
prisma/           Schema + migrations (inside backend/)
```

## Common Commands
```bash
npm install                        # install all workspace deps
npm run dev                        # backend dev server (tsx watch, port 3000)
npm run dev:frontend               # frontend dev server (Vite, port 5173)
npm run build                      # build both workspaces
npm test                           # run all tests (backend Jest + frontend Vitest)
npm run test:backend               # backend tests only (Jest, serial via maxWorkers=1)
npm run docker:build               # rebuild and redeploy Docker stack
npm run docker:up / docker:down    # start/stop Docker stack
```

### Backend-specific (run from `backend/`)
```bash
npm run test:coverage              # Jest with coverage
npm run prisma:migrate             # run migrations (use --name <name>, non-interactive)
npm run prisma:generate            # regenerate Prisma client
npm run backfill:embeddings        # backfill missing vector embeddings
```

## Architecture
- **Database**: PostgreSQL 16 + pgvector. Prisma ORM. All entries, revisions, embeddings stored in DB (no filesystem memory store).
- **Auth**: JWT + bcrypt password login. Default user seeded via env vars.
- **AI**: OpenAI API for classification, chat, embeddings, entity extraction, tool-call guardrails. Configurable model keys in `.env`.
- **Services pattern**: Business logic in `backend/src/services/*.service.ts`. Routes in `backend/src/routes/*.route.ts`.
- **Frontend proxy**: Vite proxies `/api` to backend on port 3000.
- **Entry categories**: people, projects, ideas, admin, inbox.
- **Channels**: chat, email, API.

## Coding Conventions
- Backend files: kebab-case with suffixes (`*.service.ts`, `*.route.ts`, `*.test.ts`)
- React components: PascalCase (`MessageList.tsx`)
- TypeScript strict mode in both workspaces
- Frontend path alias: `@/*` → `./src/*`
- Follow existing patterns and ESLint rules
- Keep modules small and focused; API/DB logic stays in services

## Testing
- **Backend**: Jest with ts-jest, serial execution. Tests in `backend/tests/{unit,integration,property}/`. Property tests use fast-check.
- **Frontend**: Vitest. Tests colocated or in `__tests__/`.
- Always add/update tests for new routes, tools, or entry behaviors.
- Current suite: ~885 backend tests across 73 suites, 13+ frontend tests.

## Key Files
- `docs/roadmap.md` — canonical roadmap and progress tracker
- `docs/justdo-product-vision.md` — product vision
- `docs/API.md` — API documentation
- `.env.example` — all configuration options with defaults
- `backend/prisma/schema.prisma` — database schema

## Docker
- Multi-stage build: frontend → backend → production (Node 20 Alpine)
- `docker-compose.yml`: app (port 3000) + db (pgvector:pg16, port 5433)
- After code changes: `docker compose up -d --build`
- DB migrations run automatically on container start

## Important Notes
- Database migrations must run outside sandbox (escalated command)
- Run Prisma migrations non-interactively with explicit `--name`
- Email integration is optional (only active when SMTP/IMAP vars are set)
- Backend tests run serially (maxWorkers=1) to avoid DB conflicts
- Prefer backend-first slices; keep API changes documented in `docs/API.md`

## Development Principles

1. **Test-Driven Development**: Write or update tests first. Do not claim completion unless tests run and pass, or explicitly state why they could not be run.

2. **Small, Reversible, Observable Changes**: Prefer small diffs and scoped changes. Implement user-testable and visible changes before backend changes wherever feasible. Keep changes reversible where possible. Maintain separation of concerns; avoid mixing orchestration, domain logic, and IO unless trivial.

3. **Fail Fast, No Silent Fallbacks**: Validate inputs at boundaries. Surface errors early and explicitly. Assume dependencies may fail. No silent fallbacks or hidden degradation. Any fallback must be explicit, tested, and observable.

4. **Minimize Complexity (YAGNI, No Premature Optimization)**: Implement the simplest solution that meets current requirements and tests. Do not design for speculative future use cases. Optimize only with evidence.

5. **Deliberate Trade-offs: Reusability vs. Fit (DRY with Restraint)**: Apply DRY only to real, stable duplication. Avoid abstractions that increase cognitive load without clear benefit. Prefer fit-for-purpose code unless a second use case is concrete.

6. **Don't Assume—Ask for Clarification**: If requirements are ambiguous or multiple interpretations exist, ask. If proceeding is necessary, state assumptions explicitly and keep changes localized and reversible.

7. **Confidence-Gated Autonomy**: Proceed end-to-end only when confidence is high. Narrow scope and increase checks when confidence is medium. Stop and ask when confidence is low.

8. **Security-by-Default**: Treat all external input as untrusted. Use safe defaults and least privilege. Do not weaken auth, authz, crypto, or injection defenses without explicit instruction. Never introduce secrets into code.

9. **Don't Break Contracts**: Preserve existing public APIs, schemas, and behavioral contracts unless explicitly instructed otherwise. If breaking changes are required, provide migration steps and compatibility tests.

10. **Risk-Scaled Rigor**: Scale rigor with impact: (1) Low risk — unit tests, lint/format. (2) Medium risk — integration tests, edge cases, rollback awareness. (3) High risk (security, auth, money, data loss, core flows) — explicit approval before destructive actions, targeted tests, minimal refactoring.
