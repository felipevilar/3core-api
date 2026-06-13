# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run start:dev        # watch mode
npm run build            # compile to dist/
npm run start:prod       # run compiled output

# Quality
npm run lint             # ESLint with auto-fix
npm run format           # Prettier

# Tests
npm run test             # unit tests (*.spec.ts)
npm run test:watch       # watch mode
npm run test:cov         # coverage
npm run test:e2e         # end-to-end
npx jest path/to/file.spec.ts  # single test file

# Database
npm run migration:run    # apply pending migrations
npm run migration:revert # revert last migration
```

## Environment

Copy `.env.example` to `.env`. Required variables:

```
DATABASE_URL=postgresql://user:password@host:5432/postgres
PORT=3030
JWT_SECRET=<strong-secret>
JWT_EXPIRES_IN=8h
CORS_ORIGIN=http://localhost:3000
SUPERADMIN_EMAIL=admin@exemplo.com
SUPERADMIN_PASSWORD=troque-esta-senha
```

## Architecture

NestJS 11 + TypeORM + PostgreSQL. Standard NestJS module pattern: each feature folder has `module`, `service`, `controller`, `entities/`, and `dto/`.

**Modules**: `AuthModule`, `TechniciansModule`, `LandingConfigModule` — all registered in `AppModule`. TypeORM is configured asynchronously from `DATABASE_URL`. Schema is managed exclusively via migrations in `src/migrations/`.

### Authentication & Authorization

All routes require a valid JWT by default (fail-closed global guard). Opt out with `@Public()`.

- `@Public()` — marks an endpoint as unauthenticated
- `@CurrentUser()` — injects the logged-in user into a route handler parameter
- `@RequirePermissions('permission.slug')` — enforces fine-grained access via the global `PermissionsGuard`

**Permission catalog** (`src/auth/permissions.catalog.ts`) is the single source of truth. The auth migration seeds all permissions and bootstraps the `super_admin` role (all permissions) and `tecnico` role. Superadmin credentials come from env vars.

**User entity** has `passwordHash` with `select: false` — must be explicitly selected when needed (e.g., during login).

### Key patterns

- **DTOs** use `class-validator` decorators; the global `ValidationPipe` is set to `whitelist: true` (strips unknown fields) and `transform: true`.
- **Multi-entity writes** use `DataSource.transaction()` (see `TechniciansService`).
- **CORS** origin is read from `CORS_ORIGIN` env var (comma-separated list); credentials are enabled.
- **Prettier**: single quotes, trailing commas. **ESLint**: flat config (`eslint.config.mjs`), `@typescript-eslint` recommended, no-explicit-any is off.
