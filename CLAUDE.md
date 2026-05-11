# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Infra (Postgres on `:5432`, Redis on `:6379`):

```bash
docker-compose up -d
```

Prisma client / migrations:

```bash
npx prisma generate
npx prisma migrate dev --name <name>   # creates migration + applies to dev DB
npx prisma migrate deploy              # applies pending migrations (prod-style)
```

Dev (runs Nest with `--watch` on `:3000` and Vite on `:5173` concurrently — both are required):

```bash
npm run start:dev
# or run sides independently:
npm run start:dev:server
npm run start:dev:client
```

Production build + run:

```bash
npm run build        # nest build → dist/, then vite build → public/dist/ (+ manifest.json)
npm run start:prod   # node dist/main, expects NODE_ENV=production
```

No test runner, linter, or formatter is currently wired up in `package.json` — don't claim "tests pass" or run `npm test` (it doesn't exist). If adding either, add the script to `package.json` rather than assuming one.

Required env vars (see [src/config/env.ts](src/config/env.ts)): `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`. Optional: `APP_URL`, `JWT_EXPIRES_IN`, `STRAVA_REDIRECT_URI`, `PORT`, `NODE_ENV`.

## Architecture

NestJS 10 server-rendering EJS templates, with HTMX for in-place swaps and React "islands" hydrated by Vite. Prisma/Postgres for persistence, Redis for cache + OAuth state. Strava is the activity data source.

### Auth: two guards, one user

`JwtAuthGuard` is bound globally in [src/app.module.ts](src/app.module.ts) via `APP_GUARD`. Every route is JWT-protected by default — opt out with `@Public()` ([src/auth/decorators/public.decorator.ts](src/auth/decorators/public.decorator.ts)).

Browser-facing (EJS) routes use a different scheme: the JWT lives in an `access_token` httpOnly cookie, not an `Authorization` header. Pattern is `@Public() + @UseGuards(WebAuthGuard)` — `@Public()` disarms the global JWT bearer guard, and [WebAuthGuard](src/auth/guards/web-auth.guard.ts) reads the cookie, attaches the `User` to `req.user`, or redirects to `/auth/login`. `@CurrentUser()` then works for both guards.

### Server-rendered views + Vite-built client

EJS is the view engine (`views/`); static files live in `public/`. The client bundle entry is [src/client/main.ts](src/client/main.ts), built by Vite to `public/dist/` with a manifest.

[ViteAssetsService](src/vite-assets/vite-assets.service.ts) is the bridge:

- **Dev** (`NODE_ENV !== 'production'`): emits `<script>` tags pointing at `http://localhost:5173` plus the React Refresh preamble. Nest serves HTML on `:3000`, Vite serves modules on `:5173` — both processes must be running.
- **Prod**: reads `public/dist/.vite/manifest.json` at boot and emits hashed asset URLs.

[ViteAssetsMiddleware](src/vite-assets/vite-assets.middleware.ts) is applied to `*` (global) and sets `res.locals.viteHead`, which [views/partials/head.ejs](views/partials/head.ejs) renders. Any new top-level EJS page must `include('partials/head')` to pick up client assets — otherwise islands won't hydrate.

### Islands (React inside EJS)

React components mount into `<div data-island="<name>" data-props='<json>'>` containers. The mount runtime in [src/client/main.ts](src/client/main.ts):

1. Hydrates every `[data-island]` on initial load.
2. Re-hydrates on `htmx:afterSwap` so HTMX-swapped HTML brings its islands to life.
3. Skips containers already marked `data-island-mounted="1"`.

Adding an island = one entry in [src/client/islands/_registry.ts](src/client/islands/_registry.ts) (dynamic import → Vite code-split chunk) + a `default export` React component. Props are passed through as opaque JSON; keep the EJS-side JSON shape in sync with the component's prop type.

### HTMX partial endpoints

Controllers expose `partials/...` routes that `@Render(...)` a partial EJS template. HTMX swaps the response into the page in place, and the mount runtime re-hydrates any islands inside. Examples:

- [src/app.controller.ts](src/app.controller.ts) `partials/dashboard/data` → [views/partials/dashboard-data.ejs](views/partials/dashboard-data.ejs)
- [src/activities/activities.controller.ts](src/activities/activities.controller.ts) `activities/partials/list` → [views/partials/activities-list-island.ejs](views/partials/activities-list-island.ejs)

This is how the dashboard/activities update after a Strava sync without a full page reload — partial endpoints must accept the same auth guards as the parent page.

### Cache

[CacheService](src/cache/cache.service.ts) is an abstract class. [CacheModule](src/cache/cache.module.ts) is `@Global()` and binds it to [RedisCacheService](src/cache/redis-cache.service.ts) — inject `CacheService`, not Redis directly. Key builders live in [src/constants/cache-keys.ts](src/constants/cache-keys.ts); TTL constants in [src/constants/ttl.ts](src/constants/ttl.ts).

### Strava integration

[StravaService](src/strava/strava.service.ts) owns the OAuth + import flow:

- **State tickets**: `beginAuth` writes a `{ kind: 'link' | 'signin', userId? }` ticket to Redis keyed by a random state string; `handleCallback` consumes it. This decouples flow-kind from session presence at callback time. Required scopes are enforced in `assertScopes`.
- **Token refresh**: `getValidAccessToken(userId)` is the only sanctioned way to get an access token. It refreshes through Strava if within `STRAVA_TOKEN_REFRESH_LEEWAY_SECONDS` of expiry and persists the new tokens.
- **Activity import**: rows are upserted on `@@unique([userId, externalId])` with `externalId = strava:<stravaId>` ([prisma/schema.prisma](prisma/schema.prisma)). `syncOlder` paginates by counting existing `strava:` rows — don't break that invariant when adding non-Strava imports (use a different `externalId` prefix).
- **Signin self-heal**: Strava-created users (placeholder emails ending in `@pending.local`) are flipped from `PENDING` to `ACTIVE` on next Strava signin — `PENDING` only gates email/password login, which these accounts don't have. Preserve this when changing user-status logic.

## Conventions worth knowing

- Prisma models are camelCase; tables use `@@map("snake_case")`. Use the Prisma client names in code, snake_case only when writing raw SQL.
- Two `tsconfig`s: server uses [tsconfig.json](tsconfig.json) / [tsconfig.build.json](tsconfig.build.json) (CommonJS, decorators, excludes `src/client/`); the React client uses [tsconfig.client.json](tsconfig.client.json) (ESNext, JSX, no emit). Don't import server code from `src/client/` or vice versa.
- `nest-cli.json` has `deleteOutDir: true` — `nest build` wipes `dist/` each time. The client output (`public/dist/`) is owned by Vite.
- EJS pages live in `views/`; partials in `views/partials/`. Reference partials with `include('partials/<name>')` (no extension).
