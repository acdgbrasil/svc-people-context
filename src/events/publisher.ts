import type { Sql } from "postgres";

// ─── Types ──────────────────────────────────────────────────────

export type DomainEvent = {
  readonly subject: string;
  readonly payload: {
    readonly metadata: {
      readonly eventId: string;
      readonly occurredAt: string;
      readonly schemaVersion: string;
    };
    readonly actorId: string;
    readonly data: Record<string, unknown>;
  };
};

export type EventPublisher = {
  readonly publish: (event: DomainEvent) => Promise<void>;
  readonly close: () => Promise<void>;
};

// ─── Outbox publisher (writes to DB, relay publishes to NATS) ──

export const createOutboxPublisher = (sql: Sql): EventPublisher => ({
  publish: async (event) => {
    await sql`
      INSERT INTO outbox_events (subject, payload)
      VALUES (${event.subject}, ${JSON.stringify(event.payload)})
    `;
  },
  close: async () => {},
});

// ─── Noop publisher (when DB not available, e.g. in tests) ─────

export const createNoopPublisher = (): EventPublisher => ({
  publish: async () => {},
  close: async () => {},
});

// ─── Event builders ─────────────────────────────────────────────

const buildEvent = (subject: string, actorId: string, data: Record<string, unknown>): DomainEvent => ({
  subject,
  payload: {
    metadata: {
      eventId: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      schemaVersion: "1.0.0",
    },
    actorId,
    data,
  },
});

export const events = {
  personRegistered: (actorId: string, data: { personId: string; fullName: string; cpf?: string; birthDate: string }) =>
    buildEvent("people.person.registered", actorId, data),

  personUpdated: (actorId: string, data: { personId: string; fullName?: string; cpf?: string; birthDate?: string }) =>
    buildEvent("people.person.updated", actorId, data),

  roleAssigned: (actorId: string, data: { personId: string; system: string; role: string }) =>
    buildEvent("people.role.assigned", actorId, data),

  roleDeactivated: (actorId: string, data: { personId: string; system: string; role: string }) =>
    buildEvent("people.role.deactivated", actorId, data),

  roleReactivated: (actorId: string, data: { personId: string; system: string; role: string }) =>
    buildEvent("people.role.reactivated", actorId, data),

  userProvisioned: (actorId: string, data: { personId: string; zitadelUserId: string; email: string }) =>
    buildEvent("people.user.provisioned", actorId, data),

  userDeactivated: (actorId: string, data: { personId: string; zitadelUserId: string }) =>
    buildEvent("people.user.deactivated", actorId, data),

  userReactivated: (actorId: string, data: { personId: string; zitadelUserId: string }) =>
    buildEvent("people.user.reactivated", actorId, data),

  passwordResetRequested: (actorId: string, data: { personId: string; zitadelUserId: string }) =>
    buildEvent("people.user.password_reset_requested", actorId, data),
} as const;
