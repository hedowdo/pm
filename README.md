# Project Management MVP

Local Kanban application built as one Docker container.

## Start

Requirements: Docker Desktop or Docker Engine with Docker Compose.

Copy `.env.example` to `.env` and set `OPENROUTER_API_KEY`.

Windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start.ps1
```

macOS or Linux:

```sh
sh scripts/start.sh
```

Open `http://localhost:8000`.

Sign in with username `user` and password `password`. The AI assistant can create, edit, and move cards. Board changes persist in `data/`; chat history lasts only for the current browser tab and clears on logout. Restarting the application may require signing in again.

## Frontend development

```sh
cd frontend
npm install
npm run dev
```

The Docker build creates the static frontend and serves it through FastAPI.

## Test

Frontend checks:

```sh
cd frontend
npm install
npm run lint
npm test
npm run build
```

Backend checks require [uv](https://docs.astral.sh/uv/):

```sh
cd backend
uv sync --locked
uv run pytest -m "not live"
```

With the container running, run the browser workflow from `frontend/` with `PLAYWRIGHT_BASE_URL=http://127.0.0.1:8000` set in your shell, then run `npm run test:e2e`.

## Stop

Windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/stop.ps1
```

macOS or Linux:

```sh
sh scripts/stop.sh
```

Stopping preserves files in `data/`.
