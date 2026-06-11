# Rumbledore v2

Mobile-first fantasy-football companion rebuild: Next.js App Router PWA, Better Auth, Drizzle/Postgres with RLS, Redis, Inngest, and provider-abstracted ingestion.

## Quickstart

Prerequisites: Docker, Node.js 22, and pnpm 10. The shared dev box has a Bun `node` shim on `PATH`, so put the real Node first before running scripts.

```bash
export PATH=/usr/bin:$PATH
corepack enable
corepack prepare pnpm@10.28.2 --activate

pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm db:up
pnpm db:migrate
pnpm dev
```

The app runs at `http://localhost:3000`. With the dev server running, check dependencies with:

```bash
curl -fsS http://localhost:3000/api/health
```

Local defaults are Postgres on `localhost:5440` and Redis on `localhost:6390`; these match `docker-compose.yml` and the validated env defaults. Override the compose host ports with `RUMBLEDORE_DB_PORT` / `RUMBLEDORE_REDIS_PORT`, and update `DATABASE_URL` / `REDIS_URL` if you do.

## Environment

All server config is validated in `src/core/env`. Empty values in `.env.local` count as unset.

Required for local development:

- No secrets are required for the app to boot with the local stack.
- `DATABASE_URL` defaults to `postgres://rumbledore:rumbledore@localhost:5440/rumbledore`.
- `REDIS_URL` defaults to `redis://localhost:6390`.
- `BETTER_AUTH_SECRET` has a dev/test fallback, but must be set in production.

Optional real integrations:

- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` must be set together; leaving both empty keeps the OAuth route mounted with placeholders.
- `ESPN_SWID` and `ESPN_S2` are server-side ESPN cookies. Keep real values only in `.env.local`.
- `ESPN_TEST_LEAGUE_ID=95050` and `ESPN_TEST_SEASON=2026` are the known real fixture when ESPN credentials are present.
- `ANTHROPIC_API_KEY`, `THE_ODDS_API_KEY`, `SPORTSDATAIO_API_KEY`, `TAVILY_API_KEY`, `VOYAGE_API_KEY`, and `BROWSERBASE_API_KEY` are optional until their integrations are enabled.
- `MOCK_ANTHROPIC`, `MOCK_ODDS`, `MOCK_SPORTSDATAIO`, `MOCK_TAVILY`, `MOCK_VOYAGE`, and `MOCK_BROWSERBASE` accept boolean strings: `true` forces mock mode, `false` requires the corresponding key, and empty uses the key when present.

## Development Commands

```bash
export PATH=/usr/bin:$PATH

pnpm dev          # Next.js dev server
pnpm jobs:dev     # Inngest dev server, expects pnpm dev on port 3000
pnpm db:up        # local pgvector Postgres + Redis
pnpm db:down      # stop local stack
pnpm db:migrate   # apply Drizzle migrations
pnpm db:generate  # generate Drizzle migrations
```

## Validation Gates

Run the local stack before the full test suite; DB integration tests expect it.

```bash
export PATH=/usr/bin:$PATH
pnpm db:up
pnpm secret-scan
pnpm typecheck
pnpm lint
pnpm test
pnpm build
ubs <changed files>
```

If UI code changes, also run:

```bash
npx impeccable detect src/
```

Never commit `.env.local` or real credentials. CI runs the same core gates with Postgres/pgvector and Redis services.
