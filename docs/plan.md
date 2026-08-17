# Project Management MVP Implementation Plan

Status: Parts 1-10 complete and verified; MVP definition of done achieved
Last updated: 2026-08-17

## Plan rules

- Work proceeds in the numbered order below.
- A checkbox is marked complete only after the work and its listed verification pass.
- Part 2 must not begin until the user approves this plan.
- Part 6 must not begin until the user approves the Part 5 database design.
- Product code is kept deliberately small: no feature is added unless it is required by this plan.
- When a check fails, establish and record the cause before changing code.
- Secrets are never committed, copied into the frontend, baked into the image, or printed in test output.
- Inspect Git status before broad changes and preserve user-owned or unrelated work, generated data, and the current working application.

## Confirmed product and architecture decisions

- The final application is available from one local origin: `http://localhost:8000`.
- FastAPI serves the statically exported Next.js frontend at `/`.
- All backend endpoints use the `/api` prefix. The same-origin design needs no CORS layer.
- FastAPI is the only runtime web server in the final container. Node.js is used only to build the frontend image layer.
- The hardcoded MVP credentials are `user` and `password`; validation happens only in FastAPI.
- Authentication uses an opaque session identifier in an HTTP-only cookie. Sessions may be held in backend memory and may end when the container restarts. The board data must remain intact.
- The MVP runs one Uvicorn worker because in-memory authentication sessions are process-local.
- The session cookie uses `HttpOnly`, `SameSite=Lax`, and path `/`. `Secure` remains disabled for local HTTP.
- SQLite is created automatically at `/data/kanban.db` in the container.
- Compose bind-mounts the repository's ignored `data/` directory to `/data`, so container recreation does not erase boards.
- The database has only `users` and `boards` tables. Each user has at most one board, stored as one validated canonical `state_json` document; passwords and chat messages are not stored.
- The current hardcoded user is seeded idempotently. The ownership model supports more users later without exposing user IDs in the browser contract.
- The five column identifiers and their order are fixed. Users may rename columns but may not create, delete, or reorder them.
- Card order is the order of the single `cards[]` array. A card's `columnId` assigns its column; no separate position records are used.
- `GET /api/board` returns the authenticated user's complete canonical board. `PUT /api/board` strictly validates and atomically replaces that complete board, then returns the authoritative stored state.
- The frontend applies a manual change optimistically, allows only one save at a time, and reconciles the response returned by FastAPI. After a failed save it reloads the authoritative board; if that cannot be confirmed, it restores the last known board and blocks further edits until recovery succeeds.
- SQLite is the only durable source for board data. The frontend does not persist a board in `localStorage`, `sessionStorage`, or cookies.
- Manual edits and validated AI edits are persisted in SQLite.
- AI conversation history is kept only in browser `sessionStorage`, survives a refresh in the same tab, and is cleared on logout. It is never stored in SQLite.
- The backend loads the authoritative board before every AI request. The browser does not provide the authoritative board snapshot.
- OpenRouter calls use exactly `openai/gpt-oss-20b:free`. A different model is not substituted silently.
- The exact model uses a provider-compatible strict outer response containing `message` and JSON-string `operations`; every operation string is then parsed through the discriminated Pydantic operation models before any database write.
- The product title and document metadata are `Kanban Studio`; the small header label is `PROJECT BOARD`.
- AI and manual board writes are mutually exclusive in the browser so stale whole-board saves cannot race an AI transaction.
- The AI interface is a persistent 360px sidebar at 1536px and wider, and an accessible modal drawer below that breakpoint so the established horizontal board and pointer drag behavior remain usable.
- Successful user/assistant message pairs use versioned `sessionStorage` key `kanban-studio.chat.v1`. Failed drafts are retained only in component state for retry and are not written to history.

## MVP scope

Included:

- Backend-authenticated sign-in and logout using the hardcoded credentials.
- One persistent Kanban board for the signed-in user.
- Five fixed, renameable columns.
- Card creation, editing, deletion, cross-column movement, and within-column reordering.
- An AI sidebar that can create, edit, or move one or more cards.
- Session-only chat history and durable board changes.
- A single Docker container, Docker Compose, and start/stop scripts for Windows, macOS, and Linux.

Excluded:

- Registration, password reset, password storage, roles, or account management.
- Multiple boards per user.
- Column creation, deletion, or reordering.
- AI deletion of cards or AI changes to the fixed column structure.
- Persisted chat history.
- Multi-user collaboration, real-time synchronization, notifications, attachments, search, and deployment to a remote host.

## Current repository baseline

- The demo lives in the canonical `frontend/` directory; Part 2 preserved and verified its source-file inventory during the rename from `front end/`.
- This plan is canonical at `docs/plan.md`; documentation uses Linux-safe casing.
- `backend/` contains the authenticated FastAPI application, approved Part 6 SQLite board store, uv project/lockfile, static-site serving, and focused tests.
- The repository contains the Part 2 Dockerfile, Compose file, environment example, ignore rules, cross-platform scripts, and minimal root README.
- Docker Desktop 4.85.0 is installed with Docker Engine 29.6.2 and Docker Compose 5.3.1; the Part 2 image, container, scripts, persistence, and secret-isolation checks pass.
- `.env` is ignored and contains the expected OpenRouter variable name. Its value must remain private.
- The frontend is Next.js 16.3.1 with the App Router, React 19.2.8, strict TypeScript, Tailwind CSS 4, dnd-kit, Radix Dialog, Lucide, Vitest, Testing Library, and Playwright.
- The frontend board uses its reducer for interaction state and FastAPI/SQLite as the only durable source of truth; Part 7 removed browser board persistence.
- Current verification through Part 10 on 2026-08-17:
  - Frontend: all 25 Vitest tests, lint, type checking, and the static production build pass.
  - Backend: all 43 deterministic pytest tests pass in the locked container environment; the exact-model live message-only and card-creation tests also pass independently.
  - Browser: the single container-backed Playwright lifecycle passes authentication, every manual board mutation, deterministic AI create/edit/move/multi-card/message-only/error behavior, refresh persistence, session-history restore, narrow-drawer focus, and logout clearing.
  - Live UI: the exact model returned `2 + 2 equals 4` through the responsive chat after one retryable free-tier rate limit; the visible board stayed unchanged and browser logs remained clear.
  - Container: the rebuilt service is healthy at `http://localhost:8000`; a live AI-created card survived full container recreation and a new login, and the original board was restored exactly afterward.
  - Storage and security: browser board persistence is absent, generated data remains ignored, and the OpenRouter key is not present in image metadata/history, the runtime filesystem, static frontend output, or captured logs.

## Target request flow

```text
Browser
  |-- GET / and static assets ----------> FastAPI static serving
  |-- /api/auth/* ----------------------> in-memory auth sessions
  |-- /api/board and mutations ---------> board service -> SQLite /data/kanban.db
  `-- /api/chat ------------------------> board service -> OpenRouter
                                                |
                                                `-> validated operations -> SQLite
```

The backend derives the user from the session cookie for every protected request. User IDs are not accepted from browser URLs or request bodies.

## Test conventions

- Frontend unit and component tests use Vitest, jsdom, and Testing Library.
- Frontend browser tests use Playwright with Chromium at desktop and one narrow viewport where responsive behavior matters.
- Backend tests use pytest, FastAPI's test client, and a fresh temporary SQLite file per test group.
- Regular AI tests mock OpenRouter. Explicitly named live smoke tests use the real key and are not part of an offline test run.
- Container smoke tests use the public `http://localhost:8000` origin and verify both static content and `/api` behavior.
- There is no coverage-percentage or test-count target. Add the smallest focused set of tests that gives useful confidence in the behavior and its important boundaries.
- Prefer the lowest useful test layer. Do not repeat the same assertion across unit, component, browser, and container tests unless each layer protects a distinct integration boundary.
- Related checks may be combined into one readable lifecycle test; tests are not added merely to increase a count.
- Cross-platform scripts are executed on the available host and syntax-checked for the other supported shell. Scripts must contain no host-specific absolute paths.

## Part 1: Planning and frontend documentation

Goal: establish an approved, evidence-based implementation sequence without changing product behavior.

### Work checklist

- [x] Read the root project instructions and the original high-level plan.
- [x] Inventory the current repository and frontend implementation.
- [x] Record the confirmed routing, authentication, persistence, and chat-history decisions.
- [x] Expand all ten parts into implementation checklists, tests, and binary success criteria.
- [x] Document dependencies, approval gates, secrets handling, and the final acceptance flow.
- [x] Expand the frontend-local `AGENTS.md` to describe the actual code, commands, state rules, styling, and future integration constraints.
- [x] Record current frontend test, lint, build, and browser-test baselines.
- [x] Keep product source and infrastructure unchanged.
- [x] Obtain explicit user approval for this plan.

### Tests

- [x] Confirm the plan contains Parts 1 through 10 in order.
- [x] Confirm every part has a work checklist, tests, and success criteria.
- [x] Confirm all clarified decisions appear in the plan.
- [x] Confirm no secret value appears in documentation.
- [x] Confirm the frontend guide matches the inspected source and package configuration.
- [x] Confirm no product source or infrastructure file was intentionally changed.

### Success criteria

- [x] The plan is detailed enough to execute without inventing additional product scope.
- [x] The frontend-local instructions accurately describe the existing demo and its migration constraints.
- [x] The user explicitly approves the plan and authorizes Part 2.

## Part 2: Docker and FastAPI scaffolding

Goal: run one minimal FastAPI container that serves an example page and a working example API call.

### Work checklist

- [x] Recheck Git status and inventory the current untracked frontend files before any move.
- [x] Rename `front end/` to the canonical `frontend/` path, then verify the inventory so no file is lost or overwritten.
- [x] Normalize frontend package metadata and cross-platform command references where the folder move exposes inconsistencies.
- [x] Check current official releases for the small Python dependency set and select the latest compatible stable versions at implementation time.
- [x] Create a minimal Python project in `backend/` managed by `uv`, including `pyproject.toml` and `uv.lock`.
- [x] Add a small FastAPI application with `GET /api/health` returning a stable JSON response.
- [x] Add temporary static HTML at `/` that visibly calls `/api/health` and renders the result.
- [x] Ensure `/api/*` routing is registered separately and cannot be swallowed by static-file fallback behavior.
- [x] Add backend pytest configuration and focused scaffold tests.
- [x] Add a single-service Compose file and a Dockerfile for the Python scaffold.
- [x] Run one Uvicorn worker so the process-local session store remains coherent.
- [x] Publish container port 8000 at `http://localhost:8000`.
- [x] Mount ignored host directory `./data` at container path `/data` without deleting it on stop.
- [x] Pass `.env` at runtime; do not copy it into the image.
- [x] Add `.env.example` containing variable names and safe placeholders only.
- [x] Add `.dockerignore` and extend `.gitignore` for Node, Next, Playwright, Python, database, and generated artifacts.
- [x] Add `scripts/start.ps1` and `scripts/stop.ps1` for Windows.
- [x] Add shared `scripts/start.sh` and `scripts/stop.sh` for macOS and Linux.
- [x] Make start scripts build and start Compose, then report the local URL after health succeeds.
- [x] Make stop scripts stop only this Compose project and preserve `data/`.
- [x] Add a minimal root README with prerequisites and start/stop commands.

### Part 2 verification record

- Dependency versions checked against official sources: Python 3.14.6, uv 0.11.32, FastAPI 0.139.2, Uvicorn 0.51.0, HTTPX2 2.9.0, and pytest 9.1.1.
- Before Docker installation, the bundled Python 3.12.13 runtime, a temporary uv 0.11.32 environment, and Git Bash were used for non-container verification. Docker Desktop 4.85.0, Docker Engine 29.6.2, and Docker Compose 5.3.1 were then used for the real container checks.
- Backend: 3 tests passed without warnings; local Uvicorn smoke returned `/` 200, `/api/health` status `ok`, and `/api/not-found` 404.
- Frontend after rename: 10 tests passed, lint passed, and the production build passed.
- Browser: the temporary page visibly reached `API connected` with no console warning or error.
- Scripts: both shell files passed Bash syntax checks; both PowerShell files parsed; PowerShell start/stop behavior produced the expected Compose commands with Docker mocked.
- Compose YAML structure, Dockerfile pins/locked install structure, ignore rules, and secret isolation passed static verification.
- Docker: the documented Windows start script built the image from a clean Docker context, launched exactly one healthy container, and served `/` plus `/api/health` at `http://localhost:8000`; unknown `/api` routing returned 404.
- Persistence: the documented stop and start scripts removed and recreated the container while a marker in the `./data:/data` bind mount remained intact. The temporary marker was removed after the check, and the final stop preserved `data/`.
- Image audit: the OpenRouter key was absent from image configuration, history, filesystem, and container logs. `.env` was absent from the image filesystem.

### Tests

- [x] Unit/integration test `GET /api/health` response and status.
- [x] Integration test that `/` returns the example HTML and does not shadow `/api/health`.
- [x] Validate `uv` lockfile installation from a clean environment.
- [x] Parse and inspect Compose YAML, Dockerfile inputs, health configuration, locked install command, mount, port, and secret exclusions.
- [x] Run `docker compose config` and build the image without relying on host dependencies.
- [x] Start local Uvicorn and smoke-test `/`, `/api/health`, and unknown `/api` routing from the host.
- [x] Start the container and smoke-test `/` plus `/api/health` from the host.
- [x] Execute PowerShell start/stop behavior with Docker mocked and syntax-check the macOS/Linux scripts with Git Bash.
- [x] Execute start/stop against Docker, then stop and restart while confirming the mounted `data/` directory is retained.
- [x] Confirm `.env` and its value are absent from source files, served content, and test output, and confirm `.env` is excluded from the build context.
- [x] Inspect the built image configuration/layers for the secret.

### Success criteria

- [x] One supported start command launches one healthy container at `http://localhost:8000`.
- [x] The example page visibly receives a successful same-origin API response.
- [x] One supported stop command stops the project without deleting persistent data.
- [x] A clean Docker build does not require Python or Node installed on the host.

## Part 3: Static Next.js frontend in the container

Goal: replace the example page with the existing Kanban demo, exported at build time and served by FastAPI.

### Work checklist

- [x] Read the installed Next.js static-export guidance before changing frontend configuration.
- [x] Check the existing frontend dependencies against current official stable releases and update only where needed, with the full regression suite.
- [x] Configure Next.js with `output: "export"` so `next build` produces `frontend/out/`.
- [x] Keep the frontend entirely static and client-side; do not add Next.js route handlers, server actions, runtime cookies, or a Node production server.
- [x] Change Playwright and documentation commands from Windows-only `npm.cmd` where a cross-platform command is required.
- [x] Preserve the five columns, seeded cards, reducer behavior, drag-and-drop, dialogs, accessibility labels, test IDs, and visual palette.
- [x] Add a Node build stage to the Dockerfile and copy only the static export into the FastAPI runtime stage.
- [x] Serve `index.html`, Next assets, and a controlled frontend fallback while keeping `/api/*` reserved for FastAPI.
- [x] Remove the temporary scaffold HTML after the exported site is served.
- [x] Keep Node.js and frontend source/dependencies out of the final runtime image.
- [x] Update the minimal README for local frontend development and the container workflow.

### Part 3 verification record

- Dependency review used the npm registry and official release guidance. The frontend was updated to Next.js 16.3.1, React and ReactDOM 19.2.8, Lucide React 1.31.0, current Testing Library patches, and Node 24 types. ESLint 10 and TypeScript 7 were rejected after their installed Next lint plugins proved incompatible; ESLint 9.39.5 and TypeScript 5.9.3 are the latest compatible releases. The dependency tree is valid and `npm audit` reports zero vulnerabilities after updating transitive `nanoid` to 3.3.18.
- Static export: lint passed, all 10 Vitest tests passed, type checking passed, and `next build` generated `frontend/out/index.html` plus all referenced assets.
- Backend: 5 FastAPI tests passed for health, root HTML, a representative Next asset, JSON 404 behavior under `/api`, and the static frontend 404.
- Docker: a no-cache multi-stage build passed using Node.js 24.18.0 only in the build stage. One healthy FastAPI container served the Kanban page and all eight referenced Next assets from port 8000.
- Runtime audit: the final image contains no Node binary, frontend source directory, package metadata, or `node_modules`, and the running process list contains Uvicorn with no Node process.
- Browser: the container-backed Playwright workflow passed initial render, column rename, card create/edit/delete, cross-column drag, and same-column keyboard reorder. Browser inspection confirmed the established layout and styling remained intact.
- The prior Playwright development-server memory failure did not reproduce because container-backed runs set `PLAYWRIGHT_BASE_URL` and intentionally do not spawn Next.js. Reorder failures were traced to the old no-op insert-before gesture and to dnd-kit's deferred keyboard sensor state; the test now moves the actual second card upward and waits for sensor transitions.
- Security and cleanup: the temporary scaffold page was removed. The OpenRouter key is absent from the static export and from the final image configuration, history, and filesystem.

### Tests

- [x] Run frontend lint, Vitest tests, and the production static export.
- [x] Assert `frontend/out/index.html` and referenced assets exist after the build.
- [x] Backend integration test `/`, a representative `/_next/static/*` asset, `/api/health`, and unknown paths.
- [x] Build the complete multi-stage image from a clean context.
- [x] Run Playwright against the container and cover initial render, column rename, card create/edit/delete, cross-column movement, and same-column reorder.
- [x] Confirm a browser refresh at `/` works and all assets come from port 8000.
- [x] Confirm the final image has no running Node server.
- [x] Diagnose the recorded Playwright/Node memory failure if it reproduces; prove the cause before changing memory or runner settings.

### Success criteria

- [x] The current Kanban demo is displayed at `/` from the single FastAPI container.
- [x] Existing behavior and styling remain intact.
- [x] The image serves the frontend without a Node.js runtime process.
- [x] Frontend, static-serving, container, and browser tests pass.

## Part 4: Hardcoded user sign-in

Goal: require backend-authenticated sign-in before the board can be viewed.

### Work checklist

- [x] Add `POST /api/auth/login`, `GET /api/auth/me`, and `POST /api/auth/logout`.
- [x] Validate exactly `user` and `password` on the backend; do not embed credential-validation logic in the frontend.
- [x] Generate an opaque session ID with a cryptographically suitable random generator and hold active sessions in backend memory.
- [x] Set and clear the HTTP-only session cookie with the confirmed local flags.
- [x] Return consistent 400 responses for malformed input and 401 responses for failed or missing authentication.
- [x] Keep `/api/health` public and require authentication for board and AI routes as they are added.
- [x] Add a frontend session check and loading state before rendering protected content.
- [x] Add an accessible sign-in form using the project palette, including pending and invalid-credential states.
- [x] Add logout and expired-session behavior.
- [x] Keep the MVP backend at one Uvicorn worker while sessions remain in memory.
- [x] Do not clear persistent board data on logout.
- [x] Document that an application restart may require signing in again.

### Part 4 verification record

- Backend: all 7 tests passed in the locked Python 3.14 container environment. The focused auth coverage proves successful login, cookie flags, authenticated session lookup, logout revocation, invalid credentials, malformed input, and unknown-session rejection.
- Frontend: lint passed, all 13 Vitest tests passed, TypeScript passed as part of the production build, and the static export completed successfully.
- Browser: the single container-backed Playwright workflow passed signed-out protection, valid login, HTTP-only cookie behavior, active-session refresh, the existing board workflow, logout, and preservation of browser-local board edits across a later login.
- Container: the rebuilt service is healthy at `http://localhost:8000`; `/api/health` remains public, unauthenticated and revoked `me` requests return 401, and the live login/session/logout flow succeeds.
- Static/security inspection: exported HTML contains only the session-loading state before hydration, not the board region or seeded cards. Frontend source and production JavaScript contain no exact hardcoded username literal, backend credential constants, or credential-comparison branch. The title and document metadata are now `Kanban Studio`.

### Tests

- [x] Add one focused backend auth-lifecycle test covering the session cookie, authenticated `me`, logout, and revocation, plus a compact rejection test for invalid and malformed credentials.
- [x] Verify at the HTTP/browser boundary that the cookie is HTTP-only and unavailable to frontend JavaScript.
- [x] Add the minimum frontend component coverage needed for session loading, signed-out and invalid-login states, authenticated board rendering, and logout.
- [x] Extend the existing browser workflow to prove the board is unavailable before login, appears after login, survives refresh, and disappears after logout instead of creating a duplicate end-to-end suite.
- [x] Confirm by static inspection that the production frontend contains no credential-validation logic or embedded credential pair.

### Success criteria

- [x] Only the valid hardcoded credentials create an authenticated backend session.
- [x] The board is never rendered to an unauthenticated user.
- [x] Refresh retains an active login; logout immediately revokes it.
- [x] Authentication remains intentionally simple and independent of board persistence.

## Part 5: SQLite data model proposal

Goal: define and obtain approval for the smallest durable model that preserves the complete board and supports multiple users later.

### Proposed baseline

- `users`: stable ID and unique username. The hardcoded password is not stored.
- `boards`: stable ID, unique user foreign key, and `state_json` containing one validated canonical `BoardState`.
- `BoardState` keeps the current `columns[]` and ordered `cards[]` arrays. Array order is the ordering rule; no separate position rows are needed.
- Chat messages are not represented in the database.

This two-table design matches the existing frontend shape, enforces one board per user, and makes any complete manual or multi-operation AI update atomic with one board-row write. The exact SQL fields, constraints, seed state, and JSON definition remain subject to the Part 5 approval gate.

### Work checklist

- [x] Review the current `BoardState`, fixed column IDs, seed data, card fields, and array-order behavior.
- [x] Define IDs, SQLite types, nullability, the user foreign key, and the one-board-per-user uniqueness rule.
- [x] Define the canonical `BoardState` JSON shape and API representation.
- [x] Require exactly the five fixed column IDs in their fixed order, with non-empty renameable titles.
- [x] Require unique non-empty card IDs, non-empty card titles, string details, and a valid fixed `columnId` for every card.
- [x] Preserve card order directly through the ordered `cards[]` array.
- [x] Define Pydantic validation on every database read and before every write.
- [x] Define idempotent creation of a new database, hardcoded user, and initial board state.
- [x] Define ownership lookup from the authenticated username and atomic replacement of one user's board row.
- [x] Save the machine-readable table and `BoardState` proposal as `docs/database-schema.json`.
- [x] Document rationale, initialization, validation, persistence, ownership, transactions, and API mapping in `docs/database.md`.
- [x] Document why JSON state is sufficient for this single-board MVP and when future requirements would justify normalized card rows.
- [x] Include worked JSON examples for rename, card creation/edit/deletion, same-column reorder, cross-column movement, multi-operation AI change, and a second user.
- [x] Do not implement database code during this design part.
- [x] Obtain explicit user approval of the schema before Part 6.

### Part 5 verification record

- The machine-readable proposal parses as valid JSON, and its complete seed state exactly matches the frontend `initialBoardState`.
- The seed plus all 8 worked result states pass the canonical validation rules; all 9 intentionally invalid states are rejected.
- Automated consistency checks confirm `docs/database-schema.json` and `docs/database.md` declare the same two tables, fields, ownership boundary, API routes, fixed columns, transaction model, and exclusion of chat storage.
- An in-memory SQLite 3.46.1 probe in the Python 3.14 target image successfully created the exact proposed tables and proved idempotent initialization, one board per user, foreign-key enforcement, JSON validity, rollback behavior, a single atomic AI-result commit, and isolation of a second user's board.
- No backend, frontend, container, or database implementation file was changed during Part 5.

### Tests

- [x] Parse `docs/database-schema.json` as valid JSON.
- [x] Confirm the JSON proposal and `docs/database.md` declare the same tables, fields, keys, ownership rule, and board validation rules.
- [x] Validate the seeded board and every worked valid example against the proposed `BoardState` definition.
- [x] Reject examples with missing/extra/reordered fixed columns, duplicate IDs, unknown column references, blank titles, malformed cards, or non-array ordering.
- [x] Walk a multi-operation AI update through one proposed board-row transaction.
- [x] Confirm two users have independent board rows and cannot select or replace each other's state.
- [x] Confirm no chat-history table or field exists.

### Success criteria

- [x] The proposal represents every existing board behavior in the current `BoardState` shape.
- [x] One board per user is enforced while multiple user rows remain possible.
- [x] Manual and multi-operation AI writes are unambiguously atomic.
- [x] The JSON proposal and explanation agree.
- [x] The user explicitly approves the schema.

## Part 6: Persistent board backend

Goal: make FastAPI the authenticated, durable source of truth for the user's complete Kanban board.

### Work checklist

- [x] Implement the approved two-table SQLite schema with the Python standard-library `sqlite3` module unless Part 5 evidence requires a different choice.
- [x] Open a short-lived connection per unit of work, enable foreign keys, and wrap board replacement in an explicit transaction.
- [x] Create the database and schema automatically when the configured file is absent.
- [x] Seed the hardcoded user and one initial board idempotently without overwriting an existing board.
- [x] Resolve board ownership only from the authenticated session username.
- [x] Add strict Pydantic models for the canonical `BoardState` shape.
- [x] Implement authenticated `GET /api/board` returning the user's validated board.
- [x] Implement authenticated `PUT /api/board` validating and atomically replacing the user's complete board.
- [x] Serialize only the validated canonical model into `state_json` and validate it again when loading from SQLite.
- [x] Reject missing, extra, duplicated, or reordered fixed columns; blank column/card titles; duplicate card IDs; malformed details; and unknown card-column references.
- [x] Return the authoritative full board after a successful `PUT`.
- [x] Keep board load, validation, pure operations, and atomic persistence in small reusable functions so Part 9 can update the same state without calling an HTTP route internally.
- [x] Return concise 400, 401, and 500 errors without exposing database internals or invalid stored JSON.

### Part 6 verification record

- Backend: all 13 tests passed in the locked Python 3.14 container environment. Coverage includes schema creation, exact seed data, idempotent initialization, canonical whole-board replacement, every required mutation shape, invalid-state atomicity, authentication, second-user isolation, reopen persistence, and concise invalid-storage handling.
- Frontend regression: all 13 Vitest tests passed, lint passed, TypeScript passed, and the static production build completed successfully.
- Container: the rebuilt service is healthy at `http://localhost:8000`, automatically created `data/kanban.db`, and served authenticated `GET /api/board` and `PUT /api/board` successfully.
- Persistence: a temporary board rename survived complete container removal and recreation through the `./data:/data` bind mount. The old in-memory session was correctly rejected with 401 after restart, a new login read the persisted change, and the original board was restored afterward.
- Browser regression: the single container-backed Playwright authentication and Kanban workflow passed after the backend/database changes.

### Tests

- [x] Create a database from an empty temporary path and verify both tables and seed rows.
- [x] Run initialization twice and prove it is idempotent.
- [x] Test authenticated `GET` and valid atomic `PUT`.
- [x] Use valid whole-board states to cover column rename, card create/edit/delete, same-column reorder, cross-column move, and move into an empty column.
- [x] Test trimmed required titles, optional details, exact fixed columns/order, unique card IDs, and valid card-column references.
- [x] Test every invalid-board case and prove the stored JSON remains byte-for-byte unchanged after rejection.
- [x] Insert a second test user and prove complete read/write isolation.
- [x] Close and reopen the SQLite file and prove board changes persist and validate.
- [x] Run API tests with and without authentication.
- [x] Recreate the container while retaining `data/` and prove the board remains unchanged.

### Success criteria

- [x] A missing database initializes automatically with the expected user and board.
- [x] `GET /api/board` and `PUT /api/board` are the complete, documented manual board contract.
- [x] Invalid replacements are atomic and do not alter stored state.
- [x] Data survives API process and container restarts.
- [x] The API never accepts a browser-supplied user identity.

## Part 7: Frontend and backend integration

Goal: replace browser-local board persistence with the authenticated whole-board API.

### Work checklist

- [x] Add a small typed same-origin API client using relative `/api` URLs.
- [x] Load the board from `GET /api/board` only after authentication succeeds.
- [x] Render explicit initial-loading, saving, unauthorized, and recoverable-error states.
- [x] For each reducer action, send the resulting complete `BoardState` to `PUT /api/board`.
- [x] Reconcile each success with the authoritative board returned by the backend.
- [x] Restore or refetch the authoritative board after a failed optimistic interaction; never overwrite it with stale browser state.
- [x] Allow only one board save at a time so an older response cannot replace newer local state.
- [x] Remove board reads and writes from `localStorage` and remove the temporary storage test shim where no longer needed.
- [x] Preserve fixed column IDs, card ordering, dialog behavior, drag-and-drop, accessible names, and the established visual design.
- [x] Keep logout separate from board deletion.

### Part 7 verification record

- API client and components: all 17 Vitest tests passed. Focused coverage proves relative GET/PUT calls and complete payloads, error mapping, authenticated initial load, loading/saving/error states, every UI mutation save, authoritative response reconciliation, one-save-at-a-time behavior, failed-save refetch, retry, and expired-session handling.
- Regression: all 13 backend tests passed, frontend lint passed, TypeScript passed, and the static production build completed successfully.
- Browser: the single container-backed Playwright workflow used the real board API for rename, create, edit, cross-column move, same-column reorder, and delete. It waited for each PUT and refreshed after every mutation before asserting persistence, then restored the original board.
- Browser storage: product source contains no `localStorage`, board storage key, or saved-board parser. The browser test confirmed `kanban-mvp.board.v1` is absent.
- Container persistence: a browser-made rename survived complete container removal and recreation through SQLite, the expired in-memory session required a new login, and the persisted edit reappeared. The original `Ideas` title was restored afterward; the final container is healthy and browser logs are clean.

### Tests

- [x] Unit-test the API client `GET`/`PUT` paths, methods, complete-state payloads, responses, and error mapping.
- [x] Component-test initial load, every reducer-backed save, one-save-at-a-time behavior, failed load, failed save, unauthorized response, and server reconciliation.
- [x] Run the full backend suite and frontend lint/build/unit suite.
- [x] Browser-test login followed by rename, card create/edit/delete, cross-column movement, and same-column reorder against the real backend.
- [x] Refresh after every mutation type and prove the new state remains.
- [x] Stop and recreate the container without deleting `data/`, sign in again, and prove all edits remain.
- [x] Confirm board state is no longer stored under `kanban-mvp.board.v1` or any replacement browser-storage key.

### Success criteria

- [x] SQLite is the only durable board source of truth.
- [x] Every manual edit survives browser refresh and container recreation.
- [x] Overlapping saves are prevented and failed requests cannot silently replace correct server state.
- [x] Existing board interactions and appearance remain functional.

## Part 8: OpenRouter connectivity

Goal: prove the authenticated backend can call the required OpenRouter model without exposing the API key.

### Work checklist

- [x] Verify the current official OpenRouter request format before implementation.
- [x] Add a small backend OpenRouter client with `httpx2` and runtime `OPENROUTER_API_KEY` loading.
- [x] Use exactly `openai/gpt-oss-20b:free` and record the model in one backend configuration location.
- [x] Establish the authenticated `POST /api/chat` route with a simple message response before board operations are added.
- [x] Configure a finite request timeout and map missing-key, authentication, rate-limit, timeout, malformed-response, and upstream errors to concise API errors.
- [x] Keep request headers, API keys, and raw provider failures out of logs and browser responses.
- [x] Add deterministic mocked tests to the regular backend suite.
- [x] Add an explicitly marked live smoke test that asks `2+2` using the root `.env` key.
- [x] Do not make live network calls during ordinary offline tests.

### Part 8 verification record

- The current contract was confirmed against the official OpenRouter quickstart, API reference, and model listing on 2026-08-17: bearer-authenticated `POST https://openrouter.ai/api/v1/chat/completions`, an OpenAI-compatible `messages` payload, and the exact available model slug `openai/gpt-oss-20b:free`.
- The runtime client keeps the endpoint, model, and 45-second timeout in one backend module, loads `OPENROUTER_API_KEY` only at request time, and sends no optional attribution or browser-derived authentication headers.
- Backend: all 27 deterministic tests passed with the live test deselected. Focused mocked coverage proves the exact URL, bearer header presence, model and message payload, parsed reply, missing configuration, provider authentication failure, rate limiting, timeout, provider 4xx/5xx, malformed JSON, missing response fields, route authentication, input trimming, and the concise response contract.
- Live: the explicitly selected pytest smoke test passed independently against the real provider through authenticated FastAPI, asking `2+2` and receiving a response expressing `4`; 27 offline tests were deselected during that run.
- Container: the rebuilt application is healthy at `http://localhost:8000`, packages `httpx2` in its runtime environment, and serves the authenticated live chat route without changing the frontend or board data.
- Secret audit: the key value is absent from image configuration/history, the runtime filesystem, static frontend output, and container logs. Provider error bodies are not returned to the browser or included in application exceptions.

### Tests

- [x] Mock and assert the OpenRouter URL, authorization header presence, exact model, message payload, and parsed assistant response without snapshotting the key.
- [x] Test missing key, invalid key response, timeout, rate limit, provider 5xx, invalid JSON, and missing response fields.
- [x] Test unauthenticated access to `/api/chat`.
- [x] Run the live `2+2` smoke test and confirm a valid response expressing `4`.
- [x] Inspect the static frontend output, container history/configuration, and captured logs for accidental key exposure.

### Success criteria

- [x] The exact required model responds successfully through FastAPI in the live smoke test.
- [x] Regular tests remain deterministic and network-independent.
- [x] Provider problems return understandable errors without leaking secrets.
- [x] The exact model was available, so no substitution or user escalation was required.

## Part 9: Structured AI board operations

Goal: send the authoritative board and conversation to the model, then validate and atomically persist any requested card operations.

### Structured contract

The model response contains:

- `message`: the assistant text shown to the user.
- `operations`: zero or more discriminated operations:
  - `create_card`: replacement title, details, target column ID, and target position.
  - `edit_card`: existing card ID plus replacement title and details.
  - `move_card`: existing card ID, target column ID, and target position.

The backend, not the model, generates new card IDs. Later operations in the same response may reference only card IDs that already existed in the board supplied to the model; a newly created card cannot be edited or moved again in that response. Creation already places it in the requested target location. AI card deletion and column-structure changes are outside MVP scope.

Target positions are zero-based insertion indexes. A create position is evaluated against the target column's current cards. A same-column move position is evaluated after removing the moving card. Operations are evaluated in listed order against the state produced by earlier operations.

### Work checklist

- [x] Define strict Pydantic models for the assistant response and each operation type plus the provider-compatible strict outer JSON schema.
- [x] Accept one non-empty user message plus prior user/assistant messages supplied from the current browser session.
- [x] Validate conversation roles and content before calling the provider.
- [x] Load the signed-in user's current board from SQLite for every request.
- [x] Build a stable system instruction containing the complete canonical board JSON, operation rules, and conversation context.
- [x] Request Structured Outputs from OpenRouter using the exact required model and schema.
- [x] Parse and validate the response before beginning any database mutation.
- [x] Resolve all referenced cards and columns within the authenticated user's board.
- [x] Generate IDs for `create_card` operations on the backend.
- [x] Reject an operation that tries to reference a card created earlier in the same response; only pre-existing board IDs are valid references.
- [x] Apply every operation through the Part 6 board service in one transaction and preserve requested order.
- [x] Roll back the full operation list if any operation is invalid or fails.
- [x] Return the assistant message, a concise summary of applied operations, and the authoritative updated board.
- [x] Return the unchanged board on valid message-only responses.
- [x] Keep conversation history out of SQLite and logs.
- [x] If the exact model/provider rejects strict Structured Outputs, capture the response and ask for direction before changing model or contract.

### Part 9 verification record

- All 43 deterministic backend tests pass with the two live tests deselected. They cover the provider payload and schema, complete board and conversation context, message-only replies, each operation type, ordered multi-operation updates, same- and cross-column movement, backend-generated IDs, unknown/new/duplicate card rejection, invalid positions, atomic rollback, authentication, second-user isolation, reopen persistence, provider errors, and absence of chat storage.
- The official OpenRouter models API lists both `response_format` and `structured_outputs` for `openai/gpt-oss-20b:free`, and requests use `provider.require_parameters: true`. Live probes proved the active free provider reliably enforces a small outer schema but intermittently ignores schemas using generated definitions, nested operation unions/objects, or unsupported keywords.
- The model remains exactly `openai/gpt-oss-20b:free`. Its strict provider-facing response is the compatible outer `{message, operations[]}` shape, where every operation is a JSON string. The backend parses each string through the discriminated create/edit/move Pydantic models, resolves ownership and positions, and rejects the full response before persistence if anything is invalid.
- Both live tests pass independently through authenticated FastAPI: the message-only test returned `4` with no board change, and the mutation test created a card in a temporary SQLite database and read it back in the requested position.
- Container: the rebuilt application is healthy at `http://localhost:8000`. A real AI-created card persisted through the mounted SQLite database, the response returned the authoritative board and applied-operation summary, and the original board was restored afterward.
- Secret audit: the replacement key is ignored by Git and absent from image metadata/history, runtime files, static frontend output, captured logs, and source diffs.

### Tests

- [x] Assert the current database board, latest question, and complete supplied history are included in the provider request.
- [x] Test a message-only response with zero operations and no database change.
- [x] Test each operation type independently.
- [x] Test multiple creates, edits, and moves in one response, with later operations limited to card IDs present in the supplied board.
- [x] Test and reject a later operation that attempts to reference a card newly created in the same response.
- [x] Test card order after same-column and cross-column AI moves.
- [x] Test malformed structured output, unknown operation type, duplicate/unknown card, unknown column, blank title, and invalid position.
- [x] Prove one invalid operation rolls back every earlier operation in the same response.
- [x] Test authentication and second-user isolation.
- [x] Test provider timeout/error after loading the board and prove it makes no database change.
- [x] Close and reopen SQLite after a valid AI update and prove the update remains.
- [x] Run explicit live strict-schema message-only and card-creation smoke tests with the exact model.
- [x] Confirm no chat record is written to SQLite.

### Success criteria

- [x] The provider always receives the authoritative board and current conversation.
- [x] Only schema-valid, ownership-valid operations can mutate the board.
- [x] Multi-operation responses are all-or-nothing.
- [x] AI-created, edited, and moved cards persist exactly like manual changes.
- [x] Chat history remains session-only.

## Part 10: AI chat sidebar and final integration

Goal: deliver the complete responsive chat experience and automatically show durable AI board changes.

### Work checklist

- [x] Add a polished desktop sidebar and a usable small-screen drawer without reducing the board's existing functionality.
- [x] Use the required yellow, blue, purple, navy, and gray palette; keep text concise and use no emojis.
- [x] Add accessible open/close controls, focus management, labels, keyboard behavior, and screen-reader status text.
- [x] Render user and assistant messages, an empty state, sending state, and concise retryable errors.
- [x] Send the current user message and browser-session history to `/api/chat`.
- [x] Store only user/assistant chat messages in `sessionStorage` under one versioned key.
- [x] Restore chat after refresh in the same tab and clear it on logout.
- [x] Do not store chat in `localStorage`, cookies, or SQLite.
- [x] On a successful AI response, replace the visible board immediately with the authoritative returned board.
- [x] On a provider or validation failure, retain the existing board and show the error.
- [x] Support message-only replies as well as single- and multi-card updates.
- [x] Keep the input usable after success and retryable after failure; prevent accidental duplicate sends while a request is active.
- [x] Update the minimal README with final setup, start, sign-in, test, and stop instructions.
- [x] Run the complete offline suite, container suite, deterministic AI browser suite, and explicit live smoke tests.

### Part 10 verification record

- UI and state: the final frontend adds one typed chat client and one chat component. Successful responses replace the reducer state with the authoritative returned board; AI requests and manual whole-board saves cannot overlap. Only successful user/assistant pairs are stored under `kanban-studio.chat.v1`, and successful logout removes that key.
- Fullscreen layout follow-up: the board grid and chat now consume one shared state derived from the rendered page width. Entering fullscreen cannot reserve the 360px desktop-chat column while leaving the chat in drawer mode.
- Responsive and accessibility: browser review confirmed the 360px wide-screen sidebar, modal drawer below 1536px, initial textarea focus, Escape closing and trigger-focus return, native keyboard-edit buttons on cards, accessible labels, live status text, and the established board scroll/drag behavior.
- Focused tests: all 25 Vitest tests pass. Coverage protects the narrow-to-fullscreen sidebar transition, exact chat payload, safe errors, valid session history, drawer focus, restore, disabled/sending state, message-only response, multi-operation board replacement, failure/no-change behavior, retry, and logout clearing.
- Browser integration: the existing single lifecycle now covers deterministic AI create, edit, move, multi-card update, message-only reply, and provider failure. It mocks the chat HTTP response at the frontend boundary while writing every successful authoritative result through the real board API and SQLite; the backend suite already covers the provider boundary and transactional chat write, avoiding redundant browser-only backend machinery.
- Persistence: the browser lifecycle proves immediate rendering and refresh persistence. A separate live exact-model card creation was then read back after full container recreation and a new login; the user's original board was restored byte-for-byte afterward.
- Live provider: both explicit backend live tests pass. The final UI message-only smoke test encountered one mapped free-tier rate limit, kept its draft, succeeded through the visible Retry control, returned `2 + 2 equals 4`, and changed no cards.
- Final acceptance: the documented Windows stop/start scripts removed and recreated the container while the board hash remained unchanged. The final service is healthy, serves the static Kanban UI from FastAPI, contains no Node runtime/frontend source, and passed the source/image/runtime/log secret audit.

### Tests

- [x] Component-test opening/closing, sending, disabled state, message rendering, message-only replies, errors, and retry.
- [x] Component-test `sessionStorage` restore and logout clearing.
- [x] Component-test immediate board replacement after one and multiple AI operations.
- [x] Deterministic browser-test AI create, edit, move, and multi-card update flows with the chat HTTP boundary mocked and the real board API/database persisting each result; retain provider-boundary coverage in backend tests.
- [x] Browser-test narrow viewport layout, keyboard focus, and accessible names.
- [x] Prove a failed or invalid AI response changes neither the UI board nor SQLite.
- [x] Refresh after an AI edit and prove the board persists while chat follows the selected session lifetime.
- [x] Recreate the container and prove manual and AI board edits remain while an authentication session may require renewal.
- [x] Verify logout clears chat but not the board.
- [x] Run frontend lint/unit/build, backend tests, Docker build/smoke, Playwright, and the explicit live OpenRouter tests.
- [x] Perform one final clean-start manual acceptance flow using the documented scripts.

### Success criteria

- [x] A fresh user can start the container, sign in, view the seeded board, and log out.
- [x] Manual column and card changes are durable.
- [x] The AI can reply without editing or can create, edit, and move one or more cards.
- [x] Valid AI changes appear automatically and remain after refresh and container recreation.
- [x] Chat history exists only for the browser session and clears on logout.
- [x] All required automated checks and the final clean-start acceptance flow pass.

## Final definition of done

- [x] The user has approved both required planning gates.
- [x] The application meets every included MVP behavior and none of the excluded features were added.
- [x] One documented command starts the healthy local application on each supported operating-system family.
- [x] One documented command stops it without deleting board data.
- [x] The final container contains FastAPI, the static frontend, and SQLite support, with no Node runtime server.
- [x] The root README remains minimal and accurate.
- [x] No secrets or generated runtime data are committed.
- [x] All tests and acceptance checks listed above pass.
