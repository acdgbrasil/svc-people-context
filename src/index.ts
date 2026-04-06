import { Elysia } from "elysia";
import { env } from "./config/env.ts";
import { createDb, migrate } from "./repository/db.ts";
import { createPersonRepository } from "./repository/person-repository.ts";
import { createRoleRepository } from "./repository/role-repository.ts";
import { createJwtVerifier, validateJwks } from "./middleware/jwt.ts";
import { createAuthGuard } from "./middleware/auth.ts";
import { createOutboxPublisher } from "./events/publisher.ts";
import { createOutboxRelay, createNoopRelay } from "./events/outbox-relay.ts";
import { createHealthRoutes } from "./routes/health.ts";
import { createPeopleRoutes } from "./routes/people.ts";
import { createRolesRoutes } from "./routes/roles.ts";

// ─── Bootstrap ──────────────────────────────────────────────────

const sql = createDb();
await migrate(sql);
await validateJwks();

const people = createPersonRepository(sql);
const roles = createRoleRepository(sql);
const guard = createAuthGuard(createJwtVerifier());
const publisher = createOutboxPublisher(sql);

const relay = env.nats.url
  ? await createOutboxRelay(sql, env.nats.url)
  : createNoopRelay();
relay.start();

const app = new Elysia()
  .use(createHealthRoutes({ sql, relay }))
  .use(createPeopleRoutes({ people, guard, publisher }))
  .use(createRolesRoutes({ people, roles, guard, publisher }))
  .listen({ port: env.port, hostname: env.host });

console.log(`people-context running on ${app.server?.hostname}:${app.server?.port}`);

// ─── Graceful shutdown ──────────────────────────────────────────

const shutdown = async (signal: string) => {
  console.log(`[shutdown] ${signal} received — draining...`);
  await relay.stop();
  app.stop();
  await sql.end({ timeout: 5 });
  console.log("[shutdown] Clean exit");
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
