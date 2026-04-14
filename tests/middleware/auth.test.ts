import { describe, it, expect } from "bun:test";
import { Elysia } from "elysia";
import { createPeopleRoutes } from "../../src/routes/people.ts";
import { createFakePersonRepository } from "../routes/fake-repositories.ts";
import { createRejectingAuthGuard } from "../routes/fake-auth.ts";
import { createFakePublisher } from "../routes/fake-publisher.ts";
import { createNoopZitadelClient } from "../../src/zitadel/index.ts";

const setup = () => {
  const people = createFakePersonRepository();
  const guard = createRejectingAuthGuard();
  const publisher = createFakePublisher();
  const zitadel = createNoopZitadelClient();
  const app = new Elysia().use(createPeopleRoutes({ people, guard, publisher, zitadel }));
  return { app };
};

describe("Auth guard — all endpoints require authentication", () => {
  it("returns 401 on POST /people when auth fails", async () => {
    const { app } = setup();
    const res = await app.handle(
      new Request("http://localhost/api/v1/people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: "Ana Costa", birthDate: "1990-05-15" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 on PUT /people/:id when auth fails", async () => {
    const { app } = setup();
    const res = await app.handle(
      new Request("http://localhost/api/v1/people/00000000-0000-0000-0000-000000000000", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: "Ana", birthDate: "1990-05-15" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 on GET /people when auth fails", async () => {
    const { app } = setup();
    const res = await app.handle(new Request("http://localhost/api/v1/people"));
    expect(res.status).toBe(401);
  });

  it("returns 401 on GET /people/:id when auth fails", async () => {
    const { app } = setup();
    const res = await app.handle(new Request("http://localhost/api/v1/people/00000000-0000-0000-0000-000000000000"));
    expect(res.status).toBe(401);
  });
});
