# Architecture — People Context

## Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| Runtime | Bun | TypeScript native, fast startup, built-in test runner |
| HTTP | Elysia | Minimal, type-safe, built for Bun |
| Database | PostgreSQL (dedicated) | Database-per-service, same as ecosystem |
| Events | NATS JetStream | Transactional Outbox pattern, ecosystem standard |
| Auth | JWT via Zitadel JWKS | Same validation pattern as social-care and queue-manager |
| Container | `oven/bun:slim` | ~80MB Docker image |

## Layers

This is a simple CRUD service — no complex domain logic, no CQRS, no event sourcing. Clean but minimal:

```
src/
├── domain/          # Person, PersonSystemRole types + invariants
├── routes/          # Elysia route handlers (thin)
├── repository/      # PostgreSQL queries
├── events/          # NATS event publishing (Outbox)
└── index.ts         # Elysia app bootstrap
```

## Principles

1. **Minimal by design** — This service stays small. If it grows, something is wrong.
2. **No domain data** — Only identity + roles. Diagnoses, assessments, schedules belong elsewhere.
3. **Idempotent dedup** — POST with existing CPF returns existing Person, never duplicates.
4. **Events for integration** — State changes published to NATS for consuming services to react.
5. **Database-per-service** — Own PostgreSQL database, never shared.
