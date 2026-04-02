# Principles — people-context

Non-negotiable design directives for the People Context service.

1. **Identity registry, not a domain service** — Answers "does this person exist?" and nothing more.
2. **Each system owns its data** — Address, family, specialty, schedule — each service stores its own, referencing PersonId.
3. **CPF is the dedup key** — Two persons cannot share the same CPF. Duplicate registration is idempotent.
4. **PersonId is permanent** — Once created, never changes, never deleted.
5. **No auth management** — Does not create logins or talk to Zitadel. That's the IAM Service's job.
6. **Roles are domain identity, not auth** — PersonSystemRole tracks what a person IS, not what they're ALLOWED to do.
