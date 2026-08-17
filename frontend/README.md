# Kanban MVP

Single-board, statically exported Kanban app with authenticated SQLite persistence through FastAPI.

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:3000`.

```bash
npm run lint
npm test
npm run build
npm run test:e2e
```

`npm run build` writes the static site to `out/`. Set `PLAYWRIGHT_BASE_URL` to `http://127.0.0.1:8000` to run Playwright against the Docker container instead of the local Next.js development server.
