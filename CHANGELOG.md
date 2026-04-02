# Changelog

All notable changes to this service will be documented in this file.

## [Unreleased]

## [0.1.0] - 2026-04-02

### Added
- **People Context service** — central identity registry for the ACDG ecosystem. Registers person existence and tracks domain roles across systems.
- **Domain layer** with branded types (`PersonId`, `Cpf`, `RoleId`, `IsoDateString`), discriminated union validation results, and union types for known systems/roles.
- **12 REST endpoints** (OpenAPI 3.1 compliant):
  - Person: `POST /people` (register with CPF dedup), `GET /people` (paginated + search), `GET /people/:id`, `GET /people/by-cpf/:cpf`, `PUT /people/:id` (update).
  - Roles: `POST /people/:id/roles` (assign, idempotent), `GET /people/:id/roles` (list), `PUT .../deactivate`, `PUT .../reactivate`, `GET /roles` (cross-person query).
  - Health: `GET /health` (liveness), `GET /ready` (readiness).
- **JWT/JWKS authentication** via Zitadel (`jose` library, RS256 verification).
- **RBAC enforcement** on all endpoints: `social_worker` for writes, `social_worker/owner/admin` for reads, `admin` for role deactivation/reactivation.
- **Token introspection fallback** (RFC 7662) for service accounts in HML, with explicit allowlist to prevent escalation.
- **X-Actor-Id header** required on all mutation endpoints.
- **NATS event publishing** (conditional via `NATS_URL`): 5 domain events (`person.registered`, `person.updated`, `role.assigned`, `role.deactivated`, `role.reactivated`) with `EventMetadata + actorId` envelope.
- **PostgreSQL** dedicated database (`people`) with idempotent migrations on startup.
- **47 tests** across 5 test files: domain validation (18), route handlers (25), auth middleware (4). Zero `any`, strict TypeScript.
- **CI/CD**: GitHub Actions workflows for typecheck + test (PR/push) and Docker image build/push to GHCR (tags).
- **K8s manifests**: production (`people-context.yaml`) and staging (`people-context-hml.yaml`) with dedicated PostgreSQL StatefulSets, BitwardenSecret CRDs, Traefik ingress, and weekly HML DB reset CronJob.
- **Docker**: multi-stage Dockerfile with `oven/bun:slim`, ~80MB image.

### Stack
- Runtime: Bun 1.3.11
- HTTP: Elysia 1.4.28
- Database: PostgreSQL 15 (postgres.js 3.4.8)
- Events: NATS (nats.js 2.29.3)
- Auth: JWT via jose 6.2.2
