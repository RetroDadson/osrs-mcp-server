# OSRS MCP Server

Source for plugin: [github.com/RetroDadson/osrs-mcp-tracker-plugin](https://github.com/RetroDadson/osrs-mcp-tracker-plugin)

This repo is the backend and login/token-management website for the plugin above. It stores OSRS player data reported by the plugin and exposes it through an [MCP](https://modelcontextprotocol.io/) server, so an AI assistant (e.g. Claude) can query it directly. Sign up with just your own OSRS name — one login, one tracked character — and it works for every OSRS account type (regular, Ironman, Hardcore Ironman, Ultimate Ironman, Group Ironman).

Originally forked from [group-ironmen](https://github.com/christoabrown/group-ironmen) — thanks to the original author for the excellent groundwork this project builds on. The server was later rewritten from Rust onto a TypeScript stack (the Rust implementation is preserved on the `rust-server-archive` branch for reference).

Tracks:

* Inventory, equipment, bank, rune pouch, quiver, seed vault, and shared bank
* Skill XP (current + historical, aggregated daily/monthly/yearly)
* Current interaction target (name and health)
* Quest state, Achievement Diaries, Collection Log
* Slayer tasks (current + history), Combat Achievements
* Farming patches
* Clue scroll completions (timestamped) and totals (from the OSRS Hiscores, authoritative)
* Boss/activity kill counts (from the OSRS Hiscores)
* Deaths (time + likely killer, best-effort)

## Architecture

A single npm-workspaces monorepo:

* `apps/server` — Fastify REST API + MCP server (`@modelcontextprotocol/sdk`, Streamable HTTP transport) + background jobs (GE prices, skills aggregation, OSRS Hiscores polling, item metadata sync), backed by PostgreSQL via [Kysely](https://kysely.dev/).
* `apps/client` — React login/token-management website (sign up with your OSRS name, log in, rename your character, appearance settings). No data-viewing dashboard — that's what the MCP server is for.
* `packages/shared` — Zod schemas, TypeScript types, and validators shared between client and server.

`apps/server` serves the REST API (`/api/*`), the MCP server (`/mcp`), and the built `apps/client` static site all from one process/port — one deployable, no reverse-proxying between separate frontend/backend containers.

## Self-hosting

### With docker-compose

Prerequisites: Docker, docker-compose.

1. Copy `docker-compose.yml` and `.env.example` onto your server.
2. Copy `.env.example` to `.env` and fill in the values — the comments in the file explain each one. At minimum you need `PG_USER`/`PG_PASSWORD`/`PG_DB` and a random `AUTH_SECRET` (used to hash login tokens — treat it like a password; rotating it invalidates every existing login token).
3. `docker-compose up -d --build`

The app builds from source (`docker/Dockerfile`, context `.`) since no image is published yet. It listens on port `8080` by default (change the `ports` mapping in `docker-compose.yml` if you want a different host port). The database schema is created automatically on first boot — no manual `schema.sql` step needed.

In the RuneLite plugin settings, set the base URL to wherever you're hosting this. Leaving it blank defaults to the public server.

### Without docker-compose

Build the image yourself: `docker build -f docker/Dockerfile -t osrs-mcp .`

Run it against your own Postgres instance:

```sh
docker run -d -p 8080:8080 \
  -e PG_USER=... -e PG_PASSWORD=... -e PG_HOST=... -e PG_PORT=5432 -e PG_DB=... \
  -e AUTH_SECRET=... \
  osrs-mcp
```

See `.env.example` for the full list of supported environment variables (hCaptcha, log level, etc).

## Local development

Prerequisites: Node.js 24+, npm, Docker (for integration/e2e tests, which use real ephemeral Postgres containers via testcontainers).

```sh
npm install
npm run build --workspace=packages/shared   # other workspaces import its compiled output

# terminal 1 - backend (needs AUTH_SECRET and either DATABASE_URL or PG_* env vars set)
npm run dev --workspace=apps/server

# terminal 2 - frontend, proxies /api and /mcp to the backend on :8080
npm run dev --workspace=apps/client
```

## Testing

Each workspace has its own test suite; run them from the workspace directory or via `npm run <script> --workspace=<name>` from the root.

* `npm test` — unit tests (vitest).
* `npm run test:integration --workspace=apps/server` — integration tests against a real testcontainers Postgres.
* `npm run test:e2e --workspace=apps/client` — Playwright e2e, spins up its own testcontainers Postgres and a real server instance.
* `npm run test:coverage` — coverage report (v8), gated at ≥80% lines/statements/functions and ≥75% branches per workspace.

`npm run lint` and `npm run typecheck` run across every workspace from the root.
