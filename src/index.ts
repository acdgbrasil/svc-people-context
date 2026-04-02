import { Elysia } from "elysia";
import { env } from "./config/env.ts";
import { createDb, migrate } from "./repository/db.ts";
import { createPersonRepository } from "./repository/person-repository.ts";
import { createRoleRepository } from "./repository/role-repository.ts";
import { createJwtVerifier } from "./middleware/jwt.ts";
import { createAuthGuard } from "./middleware/auth.ts";
import { createEventPublisher } from "./events/publisher.ts";
import { createHealthRoutes } from "./routes/health.ts";
import { createPeopleRoutes } from "./routes/people.ts";
import { createRolesRoutes } from "./routes/roles.ts";

const sql = createDb();
await migrate(sql);

const people = createPersonRepository(sql);
const roles = createRoleRepository(sql);
const guard = createAuthGuard(createJwtVerifier());
const publisher = await createEventPublisher();

const app = new Elysia()
  .use(createHealthRoutes(sql))
  .use(createPeopleRoutes({ people, guard, publisher }))
  .use(createRolesRoutes({ people, roles, guard, publisher }))
  .listen({ port: env.port, hostname: env.host });

console.log(`people-context running on ${app.server?.hostname}:${app.server?.port}`);
