# Project Management MVP Implementation Plan

Status: Part 6 complete and verified; Part 7 has not started  
Last updated: 2026-08-15

## Plan rules

- Work proceeds in the numbered order below.
- A checkbox is marked complete only after the work and its listed verification pass.
- Part 2 must not begin until the user approves this plan.
- Part 6 must not begin until the user approves the Part 5 database design.
- Product code is kept deliberately small: no feature is added unless it is required by this plan.
- When a check fails, establish and record the cause before changing code.
- Secrets are never committed, copied into the frontend, baked into the image, or printed in test output.
- Application and planning files are currently untracked in Git. Inspect paths before moving files and preserve the current demo during normalization.

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
- There is one board per user in the MVP. The database ownership model supports more users later.
- The five column identifiers and their order are fixed. Users may rename columns but may not create, delete, or reorder them.
- Manual edits and validated AI edits are persisted in SQLite.
- AI conversation history is kept only in browser `sessionStorage`, survives a refresh in the same tab, and is cleared on logout. It is never stored in SQLite.
- The backend loads the authoritative board before every AI request. The browser does not provide the authoritative board snapshot.
- OpenRouter calls use exactly `openai/gpt-oss-20b:free`. A different model is not substituted silently.

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
- The current board uses a reducer and browser `localStorage`. SQLite replaces `localStorage` as the board source of truth in Part 7.
- Existing frontend verification on 2026-08-14:
  - `npm.cmd test`: 10 tests passed.
  - `npm.cmd run lint`: passed.
  - `npm.cmd run build`: passed and prerendered `/`.
  - Playwright did not complete on this host because the spawned Node development server exhausted memory. Next.js itself reached ready state normally. This is a recorded baseline limitation, not a Part 1 product-code fix.
  - The current Playwright reorder step drags the first card over the second while the reducer inserts before the target, so that gesture cannot prove an order change. Correct the test design when Part 3 activates the browser suite.

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

- [ ] Add a small typed same-origin API client using relative `/api` URLs.
- [ ] Load the board from `GET /api/board` only after authentication succeeds.
- [ ] Render explicit initial-loading, saving, unauthorized, and recoverable-error states.
- [ ] For each reducer action, send the resulting complete `BoardState` to `PUT /api/board`.
- [ ] Reconcile each success with the authoritative board returned by the backend.
- [ ] Restore or refetch the authoritative board after a failed optimistic interaction; never overwrite it with stale browser state.
- [ ] Allow only one board save at a time so an older response cannot replace newer local state.
- [ ] Remove board reads and writes from `localStorage` and remove the temporary storage test shim where no longer needed.
- [ ] Preserve fixed column IDs, card ordering, dialog behavior, drag-and-drop, accessible names, and the established visual design.
- [ ] Keep logout separate from board deletion.

### Tests

- [ ] Unit-test the API client `GET`/`PUT` paths, methods, complete-state payloads, responses, and error mapping.
- [ ] Component-test initial load, every reducer-backed save, one-save-at-a-time behavior, failed load, failed save, unauthorized response, and server reconciliation.
- [ ] Run the full backend suite and frontend lint/build/unit suite.
- [ ] Browser-test login followed by rename, card create/edit/delete, cross-column movement, and same-column reorder against the real backend.
- [ ] Refresh after every mutation type and prove the new state remains.
- [ ] Stop and recreate the container without deleting `data/`, sign in again, and prove all edits remain.
- [ ] Confirm board state is no longer stored under `kanban-mvp.board.v1` or any replacement browser-storage key.

### Success criteria

- [ ] SQLite is the only durable board source of truth.
- [ ] Every manual edit survives browser refresh and container recreation.
- [ ] Overlapping saves are prevented and failed requests cannot silently replace correct server state.
- [ ] Existing board interactions and appearance remain functional.

## Part 8: OpenRouter connectivity

Goal: prove the authenticated backend can call the required OpenRouter model without exposing the API key.

### Work checklist

- [ ] Verify the current official OpenRouter request format before implementation.
- [ ] Add a small backend OpenRouter client with `httpx2` and runtime `OPENROUTER_API_KEY` loading.
- [ ] Use exactly `openai/gpt-oss-20b:free` and record the model in one backend configuration location.
- [ ] Establish the authenticated `POST /api/chat` route with a simple message response before board operations are added.
- [ ] Configure a finite request timeout and map missing-key, authentication, rate-limit, timeout, malformed-response, and upstream errors to concise API errors.
- [ ] Keep request headers, API keys, and raw provider failures out of logs and browser responses.
- [ ] Add deterministic mocked tests to the regular backend suite.
- [ ] Add an explicitly marked live smoke test that asks `2+2` using the root `.env` key.
- [ ] Do not make live network calls during ordinary offline tests.

### Tests

- [ ] Mock and assert the OpenRouter URL, authorization header presence, exact model, message payload, and parsed assistant response without snapshotting the key.
- [ ] Test missing key, invalid key response, timeout, rate limit, provider 5xx, invalid JSON, and missing response fields.
- [ ] Test unauthenticated access to `/api/chat`.
- [ ] Run the live `2+2` smoke test and confirm a valid response expressing `4`.
- [ ] Inspect the static frontend output, container history/configuration, and captured logs for accidental key exposure.

### Success criteria

- [ ] The exact required model responds successfully through FastAPI in the live smoke test.
- [ ] Regular tests remain deterministic and network-independent.
- [ ] Provider problems return understandable errors without leaking secrets.
- [ ] If the exact model is unavailable, the proven failure is reported for user direction rather than bypassed with another model.

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

- [ ] Define Pydantic models and the matching strict JSON schema for the assistant response and each operation type.
- [ ] Accept one non-empty user message plus prior user/assistant messages supplied from the current browser session.
- [ ] Validate conversation roles and content before calling the provider.
- [ ] Load the signed-in user's current board from SQLite for every request.
- [ ] Build a stable system instruction containing the complete canonical board JSON, operation rules, and conversation context.
- [ ] Request Structured Outputs from OpenRouter using the exact required model and schema.
- [ ] Parse and validate the response before beginning any database mutation.
- [ ] Resolve all referenced cards and columns within the authenticated user's board.
- [ ] Generate IDs for `create_card` operations on the backend.
- [ ] Reject an operation that tries to reference a card created earlier in the same response; only pre-existing board IDs are valid references.
- [ ] Apply every operation through the Part 6 board service in one transaction and preserve requested order.
- [ ] Roll back the full operation list if any operation is invalid or fails.
- [ ] Return the assistant message, a concise summary of applied operations, and the authoritative updated board.
- [ ] Return the unchanged board on valid message-only responses.
- [ ] Keep conversation history out of SQLite and logs.
- [ ] If the exact model/provider rejects strict Structured Outputs, capture the response and ask for direction before changing model or contract.

### Tests

- [ ] Assert the current database board, latest question, and complete supplied history are included in the provider request.
- [ ] Test a message-only response with zero operations and no database change.
- [ ] Test each operation type independently.
- [ ] Test multiple creates, edits, and moves in one response, with later operations limited to card IDs present in the supplied board.
- [ ] Test and reject a later operation that attempts to reference a card newly created in the same response.
- [ ] Test card order after same-column and cross-column AI moves.
- [ ] Test malformed structured output, unknown operation type, duplicate/unknown card, unknown column, blank title, and invalid position.
- [ ] Prove one invalid operation rolls back every earlier operation in the same response.
- [ ] Test authentication and second-user isolation.
- [ ] Test provider timeout/error after loading the board and prove it makes no database change.
- [ ] Close and reopen SQLite after a valid AI update and prove the update remains.
- [ ] Run an explicit live strict-schema smoke test with the exact model.
- [ ] Confirm no chat record is written to SQLite.

### Success criteria

- [ ] The provider always receives the authoritative board and current conversation.
- [ ] Only schema-valid, ownership-valid operations can mutate the board.
- [ ] Multi-operation responses are all-or-nothing.
- [ ] AI-created, edited, and moved cards persist exactly like manual changes.
- [ ] Chat history remains session-only.

## Part 10: AI chat sidebar and final integration

Goal: deliver the complete responsive chat experience and automatically show durable AI board changes.

### Work checklist

- [ ] Add a polished desktop sidebar and a usable small-screen drawer without reducing the board's existing functionality.
- [ ] Use the required yellow, blue, purple, navy, and gray palette; keep text concise and use no emojis.
- [ ] Add accessible open/close controls, focus management, labels, keyboard behavior, and screen-reader status text.
- [ ] Render user and assistant messages, an empty state, sending state, and concise retryable errors.
- [ ] Send the current user message and browser-session history to `/api/chat`.
- [ ] Store only user/assistant chat messages in `sessionStorage` under one versioned key.
- [ ] Restore chat after refresh in the same tab and clear it on logout.
- [ ] Do not store chat in `localStorage`, cookies, or SQLite.
- [ ] On a successful AI response, replace the visible board immediately with the authoritative returned board.
- [ ] On a provider or validation failure, retain the existing board and show the error.
- [ ] Support message-only replies as well as single- and multi-card updates.
- [ ] Keep the input usable after success and retryable after failure; prevent accidental duplicate sends while a request is active.
- [ ] Update the minimal README with final setup, start, sign-in, test, and stop instructions.
- [ ] Run the complete offline suite, container suite, deterministic AI browser suite, and explicit live smoke tests.

### Tests

- [ ] Component-test opening/closing, sending, disabled state, message rendering, message-only replies, errors, and retry.
- [ ] Component-test `sessionStorage` restore and logout clearing.
- [ ] Component-test immediate board replacement after one and multiple AI operations.
- [ ] Deterministic browser-test AI create, edit, move, and multi-card update flows with a mocked provider boundary and real backend/database.
- [ ] Browser-test narrow viewport layout, keyboard focus, and accessible names.
- [ ] Prove a failed or invalid AI response changes neither the UI board nor SQLite.
- [ ] Refresh after an AI edit and prove the board persists while chat follows the selected session lifetime.
- [ ] Recreate the container and prove manual and AI board edits remain while an authentication session may require renewal.
- [ ] Verify logout clears chat but not the board.
- [ ] Run frontend lint/unit/build, backend tests, Docker build/smoke, Playwright, and the explicit live OpenRouter tests.
- [ ] Perform one final clean-start manual acceptance flow using the documented scripts.

### Success criteria

- [ ] A fresh user can start the container, sign in, view the seeded board, and log out.
- [ ] Manual column and card changes are durable.
- [ ] The AI can reply without editing or can create, edit, and move one or more cards.
- [ ] Valid AI changes appear automatically and remain after refresh and container recreation.
- [ ] Chat history exists only for the browser session and clears on logout.
- [ ] All required automated checks and the final clean-start acceptance flow pass.

## Final definition of done

- [ ] The user has approved both required planning gates.
- [ ] The application meets every included MVP behavior and none of the excluded features were added.
- [ ] One documented command starts the healthy local application on each supported operating-system family.
- [ ] One documented command stops it without deleting board data.
- [ ] The final container contains FastAPI, the static frontend, and SQLite support, with no Node runtime server.
- [ ] The root README remains minimal and accurate.
- [ ] No secrets or generated runtime data are committed.
- [ ] All tests and acceptance checks listed above pass.
