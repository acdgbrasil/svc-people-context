---
title: "No hardcoded secrets or credentials"
scope: "pull_request"
severity_min: "critical"
buckets: ["security"]
enabled: true
---

## Instructions

Scan PR diff for hardcoded secrets. This service handles central identity data.

Flag: API keys, tokens (`sk_`, `pk_`, `ghp_`, `Bearer `), database passwords, JWT secrets, JWKS URLs with embedded credentials, Zitadel secrets, `.env` files committed.

Allowed: `process.env.KEY` / `Bun.env.KEY` references, `.env.example` with placeholders, test fixtures with fake values.
