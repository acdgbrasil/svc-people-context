# CLAUDE.md — people-context

## Service

Central identity registry for the ACDG ecosystem. Registers person existence and tracks domain roles across systems. Minimal by design.

## Commands

```bash
bun run dev          # Run with --watch (hot reload)
bun run start        # Run production
bun test             # Run tests
bun run typecheck    # TypeScript strict check

# Docker
docker compose up postgres -d   # Start database only
cp .env.example .env            # Configure environment
bun run dev                     # Run service locally

# Full Docker
docker compose up --build
```

## Stack

- **Runtime**: Bun 1.3.11
- **HTTP**: Elysia 1.4.28
- **Database**: PostgreSQL 15 (dedicated, database-per-service)
- **Events**: NATS JetStream via nats.js 2.29.3
- **Auth**: JWT validation via Zitadel JWKS

## TypeScript Guidelines

**MANDATORY**: Always consult `handbook/references/typescript/` before writing code. Key rules:

### Functional Programming — Non-Negotiable

- **NO classes**. Ever. No `class`, no `this`, no `new` (except for external libs).
- **NO inheritance**. Use composition and higher-order functions.
- All data structures are plain objects with `type` or `interface`.
- All behavior is expressed as **pure functions**.
- Use `readonly` for all data properties — immutability by default.
- Use closures and factory functions instead of stateful objects.
- Prefer `type` aliases for unions/intersections; `interface` for object shapes.
- Use `unknown` instead of `any`. Never use `any`.

### Function Patterns

- Prefer arrow functions for consistency.
- Use parameter destructuring for cleaner APIs.
- Generic type parameters must appear at least twice (relate inputs to outputs).
- Let TypeScript infer types when possible — annotate only when necessary.
- Prefer union types over enums (unless runtime values needed).

### Module Organization

- ES Modules with `export/import`.
- Use `export type` for type-only exports.
- Barrel exports via `index.ts` per module.

### Example — Repository Pattern (Functional)

```typescript
// CORRECT — functional, composable
import type { Sql } from "postgres";

interface PersonRepository {
  readonly findById: (id: string) => Promise<Person | null>;
  readonly create: (input: CreatePersonInput) => Promise<Person>;
}

const createPersonRepository = (sql: Sql): PersonRepository => ({
  findById: async (id) => { /* ... */ },
  create: async (input) => { /* ... */ },
});
```

```typescript
// WRONG — class-based
class PersonRepository {
  constructor(private sql: Sql) {}
  async findById(id: string) { /* ... */ }
}
```

## Architecture

```
src/
├── config/       # Environment variables, constants
├── domain/       # Types, interfaces, validation functions (pure, no deps)
├── repository/   # PostgreSQL queries (functional, injected sql)
├── routes/       # Elysia route handlers (thin, delegate to repository)
├── middleware/    # Auth (JWT/JWKS), error handling
├── events/       # NATS event publishing (Transactional Outbox)
└── index.ts      # App bootstrap
```

### Domain layer has NO external dependencies. Pure types and functions only.

## Security (Private Cloud Directives)

- **JWT validation**: Verify RS256 signature against Zitadel JWKS at `https://auth.acdgbrasil.com.br/oauth/v2/keys`
- **RBAC**: Role claims from JWT (`urn:zitadel:iam:org:project:roles`). Guard mutation endpoints.
- **X-Actor-Id**: Required header on all mutation endpoints (POST, PUT, DELETE).
- **Secrets**: NEVER hardcoded. Environment variables only, sourced from Bitwarden Secrets Manager in production.
- **SQL injection**: Always use parameterized queries via `postgres.js` tagged templates.
- **Health endpoints**: `/health` and `/ready` have NO auth (`security: []`).

## Database

- **Dedicated PostgreSQL**: `people` database, separate from all other services.
- **Naming**: Tables lowercase with underscores (`people`, `system_roles`).
- **Migrations**: Run on startup via `migrate()` in `repository/db.ts`. Idempotent (`CREATE TABLE IF NOT EXISTS`).
- **Connection pool**: Max 10 connections via `postgres.js`.

## Conventions

- **Naming**: All code, schemas, API responses in **English**.
- **Response envelope**: `{ data, meta: { timestamp } }` for all successful responses.
- **Error envelope**: `{ success: false, error: { code, message } }`.
- **Error codes**: `PEO-XXX` for person errors, `ROL-XXX` for role errors.
- **Commits**: Conventional Commits (`feat:`, `fix:`, `chore:`, etc.).
- **Versioning**: SemVer. `feat:` → minor bump, `fix:` → patch bump.

## Contracts

API contracts defined in `contracts/services/people/` (separate repo):
- OpenAPI 3.1: 12 endpoints (Person 5, Roles 5, Health 2)
- AsyncAPI 3.1: 5 NATS events
- 19 canonical YAML schemas

## Testing

- Framework: `bun test` (built-in, Jest-compatible API)
- Coverage target: ≥95%
- Test files: `tests/**/*.test.ts`
- Pattern: pure functions → easy to test without mocks
