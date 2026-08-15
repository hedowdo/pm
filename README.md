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

Sign in with username `user` and password `password`. Sessions are stored in memory, so restarting the application may require signing in again. Board data is not cleared by logout.

## Frontend development

```sh
cd frontend
npm install
npm run dev
```

The Docker build creates the static frontend and serves it through FastAPI.

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
