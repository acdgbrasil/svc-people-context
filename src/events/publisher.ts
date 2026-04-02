import { connect, StringCodec } from "nats";
import { env } from "../config/env.ts";

// ─── Types ──────────────────────────────────────────────────────

type DomainEvent = {
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

// ─── NATS publisher ─────────────────────────────────────────────

const sc = StringCodec();

const createNatsPublisher = async (url: string): Promise<EventPublisher> => {
  const nc = await connect({ servers: url });
  console.log(`NATS connected: ${url}`);

  return {
    publish: async (event) => {
      const data = JSON.stringify(event.payload);
      nc.publish(event.subject, sc.encode(data));
    },
    close: async () => {
      await nc.drain();
    },
  };
};

// ─── Noop publisher (when NATS_URL not set) ─────────────────────

const createNoopPublisher = (): EventPublisher => ({
  publish: async () => {},
  close: async () => {},
});

// ─── Factory (conditional based on env) ─────────────────────────

export const createEventPublisher = async (): Promise<EventPublisher> => {
  if (!env.nats.url) {
    console.log("NATS_URL not set — event publishing disabled");
    return createNoopPublisher();
  }
  return createNatsPublisher(env.nats.url);
};

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
} as const;
