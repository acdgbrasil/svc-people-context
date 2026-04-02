# 01 — Introduction & Purpose

## What is the People Context?

The People Context is the **central identity registry** for the ACDG ecosystem. It is the minimal, shared foundation that allows all systems to know that a person exists and what role they play in each system.

It is **not** a rich domain service. It does not store medical records, social assessments, queue positions, or work schedules. Each system owns its own data and relates it to a person via `PersonId`.

## The core principle

> "Everything a system needs to operate lives inside that system.
> The People Context only registers that a person exists and links them across systems."

Data duplication between services is accepted. Each service stores what it needs. People Context is the **glue** — the shared index.

## What it does

- **Registers** that a person exists in the ACDG ecosystem.
- **Deduplicates** by CPF — prevents the same person from being registered twice.
- **Tracks system roles** — knows which systems a person is active in and what role they have (patient, professional, employee, family member).
- **Serves as lookup** — given a PersonId, returns the minimal identity (fullName, cpf, birthDate).

## What it does NOT do

- Does not store domain-specific data (diagnoses, assessments, queue state, work schedules).
- Does not manage authentication or authorization (that's Zitadel + future IAM Service).
- Does not talk to Zitadel directly.
- Does not own family relationships (that's social-care).
- Does not own professional specialties or schedules (that's queue-manager / timesheet).

## Why it exists now

With multiple services coming online (social-care, queue-manager, timesheet, therapies), every service needs to reference people. Without a shared identity registry:

- The same person could be registered with different UUIDs in different systems.
- There's no way to answer "in which systems does this person exist?"
- Displaying a person's name on a panel requires cross-service calls to services that shouldn't be coupled.

## Users of the People Context

| Service | What it gets from People |
|---------|------------------------|
| **social-care** | PersonId for Patient and FamilyMember aggregates |
| **queue-manager** | PersonId for DailyVisit, fullName for panels |
| **timesheet** (future) | PersonId for time records |
| **therapies** (future) | PersonId for therapy sessions |
| **IAM Service** (future) | PersonId ↔ Zitadel subject mapping |

## How people enter the ecosystem

1. **Reception registers arrival** → Person created in People Context → PersonId generated.
2. **Triage in social-care** → Patient created referencing PersonId. IAM Service (future) creates Zitadel login.
3. **Admin registers professional** → Person created (or found by CPF) → PersonSystemRole added with role "professional".
4. Each service then stores its own data (diagnoses, queue state, schedules) linked to PersonId.

## Technology

- **Runtime**: Bun (TypeScript native)
- **HTTP**: Elysia
- **Database**: PostgreSQL (dedicated, database-per-service)
- **Events**: NATS JetStream (Transactional Outbox)
- **Auth**: JWT validation via Zitadel JWKS (same pattern as other services)
