# Repository Guidelines

## Project Structure & Module Organization

The backend is an ES module Fastify service in `src/`. Routes live in `src/routes/`; extraction, parsing, browser control, queueing, statistics, and configuration are grouped under `src/services/`, `src/constants/`, `src/middleware/`, and `src/config/`. The React/Vite dashboard is in `frontend/` (`frontend/src/` and `frontend/public/`). Operational scripts are in `scripts/`, API documentation is in `docs/`, and Docker setup is defined by `Dockerfile` and `docker-compose.yml`.

## Build, Test, and Development Commands

- `npm install` installs backend dependencies; run `cd frontend && npm install` for the dashboard.
- `docker compose up -d redis` starts the Redis service required by the job queue.
- `npm run dev` starts the backend with nodemon; `npm start` runs it directly.
- `cd frontend && npm run dev` starts Vite; `npm run build` creates the production bundle and `npm run lint` runs Oxlint.
- `node scripts/test-extract.js <share-url>` runs a manual browser-based extraction check (Playwright Chromium must be installed).

The root `npm test` script is a placeholder that exits with an error; do not treat it as a passing test suite.

## Coding Style & Naming Conventions

Use JavaScript ES modules, two-space indentation, semicolons, and single quotes in backend code. Match the surrounding style in React components. Use descriptive kebab-case filenames (for example, `platform-detector.js`) and keep code in the existing feature directories. Run the frontend lint command for UI changes; no root formatter or lint script is configured.

## Testing Guidelines

There is no automated root test suite yet. For extraction changes, use the manual script with a valid public share URL and confirm message counts and output. For dashboard changes, run `npm run lint` and `npm run build` from `frontend/`. API or queue changes should also be checked with Redis available and the relevant endpoints exercised locally.

## Commit & Pull Request Guidelines

Recent commits use Conventional Commit prefixes such as `feat:`, `fix:`, and `docs:`; keep subjects concise and action-oriented (for example, `fix: handle empty share responses`). A pull request should explain the behavior change, note configuration or API impact, list checks performed, and include screenshots for visible dashboard changes. Link related issues when applicable.

## Security & Configuration

Keep credentials and local settings in `.env`; never commit API keys or production secrets. Configure `API_KEY` and `REDIS_URL` for local runs, and avoid putting real credentials in examples, logs, or pull request screenshots.
