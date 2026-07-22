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
npm run migration:generate -- src/migrations/MigrationName  # generate from entity diff
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
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
```

## Architecture

NestJS 11 + TypeORM + PostgreSQL (Supabase). Each feature folder has `module`, `service`, `controller`, `entities/`, and `dto/`. Schema is managed exclusively via migrations in `src/migrations/` — never edit entities to auto-sync.

**Modules**: `AuthModule`, `TechniciansModule`, `ClientsModule`, `ChamadosModule`, `CitiesModule`, `StorageModule`, `NotificationsModule`, `LandingConfigModule`.

### Authentication & Authorization

Two global guards run on every route (fail-closed):
1. **JwtAuthGuard** — validates bearer token; skips if `@Public()` present
2. **PermissionsGuard** — runs after JWT; checks permission metadata

Decorators:
- `@Public()` — unauthenticated access
- `@CurrentUser()` — injects logged-in user into handler param
- `@RequirePermissions('a', 'b')` — AND logic (all required)
- `@RequireAnyPermission('a', 'b')` — OR logic (at least one)

**Permission catalog** (`src/auth/permissions.catalog.ts`) is the single source of truth. Migrations seed all permissions and bootstrap two system roles:
- `super_admin` — all permissions; cannot be deleted or renamed
- `tecnico` — limited subset; auto-assigned on landing page registration

JWT payload carries `{ sub, email, role, permissions[] }` — permissions are a flat string array checked at the guard level without hitting the DB.

**User entity** has `passwordHash` with `select: false` — must be explicitly selected when needed (login flow).

### Chamado (Ticket) Lifecycle

Status state machine:
```
aberto → solicitado → atribuido → a_caminho → em_atendimento → finalizado → fechado
         (any active state) → cancelado
         fechado → reaberto
```

Key behaviors:
- **Frozen snapshots**: on `atribuir()`, technician rates (`snapValorHora`, `snapCustoPorKm`, `snapCustoKmCidade`) are copied to the chamado — historical financial data never changes if rates are edited later.
- **Auto line items**: `origem: 'auto_snapshot'` lines are regenerated on assignment and finalization (hours × rate, km × rate). On reassignment, old auto lines are cleared first.
- **Pessimistic locking**: `loadOrFail()` acquires `pessimistic_write` lock to serialize concurrent state transitions.
- **`@VersionColumn()`**: optimistic lock on the Chamado entity.
- **Frozen financials**: monetary totals (`custoTecnicoTotal`, `valorClienteTotal`) are only frozen on `fechado` — not on `finalizado`.
- **Dual payment cycles**: `paymentStatus` (technician payout) and `clientePaymentStatus` (client receipt) are independent state machines.
- **Competência**: the YYYY-MM billing period is set to the month of finalization in `America/Sao_Paulo` timezone.

### Money Handling

All monetary values are stored as NUMERIC(12,2) but passed around as **strings** (never floats). Utilities in `src/common/br-money.ts`:
- `parseBrMoney()` — accepts BR format ("R$ 1.234,56") or canonical ("1234.56"), returns canonical string
- `sumMoney()` — sums via centavos integers (no float error)
- `multiplyMoney()` — quantity × unit with round-half-up on centavos

Always use these utilities for any arithmetic on money fields.

### Scope Filtering & Data Visibility

- Technicians see only their own chamados; enforced at query-builder level via `applyTecnicoScope()`.
- Out-of-scope chamados return `NotFoundException` (not `ForbiddenException`) to avoid existence leakage.
- `ChamadoEvent.metadata` (JSONB) may contain financial data; serialization in `serialize()` redacts `receita`/`margem` fields unless the caller has `financeiro.ver`. Technicians with only `financeiro.ver_proprio` see custo lines only.

### Storage (Supabase)

`StorageService` wraps Supabase Storage REST (avoids WebSocket in Node 20). Two buckets: `AVATARS_BUCKET`, `RATS_BUCKET`. It generates signed URLs (5-min validity) for both uploads and downloads. Batch download URLs in one call via `createSignedDownloadUrls()`. Storage ops throw `InternalServerErrorException` if env keys are missing.

### Notifications

`Notifier` interface (`src/notifications/`) with a `LogNotifier` default implementation. Called fire-and-forget via `notifyAfter()` in ChamadosService — never blocks a response. Swap provider by replacing the module binding.

### Key Patterns

- **DTOs**: `class-validator` + global `ValidationPipe` with `whitelist: true` (strips unknown fields) and `transform: true`.
- **Multi-entity writes**: `DataSource.transaction()` — see `TechniciansService` for the pattern.
- **Unique constraint violations**: services catch Postgres error `23505` and translate to `ConflictException`.
- **System roles**: `isSystem: true` roles (`super_admin`, `tecnico`) cannot be renamed or deleted; only their permissions can be updated. `RolesService` enforces that `super_admin` always retains `roles.ver` and `roles.gerenciar`.
- **CORS**: comma-separated list from `CORS_ORIGIN` env var; credentials enabled.
- **Prettier**: single quotes, trailing commas. **ESLint**: flat config (`eslint.config.mjs`), `@typescript-eslint` recommended, `no-explicit-any` is off.
