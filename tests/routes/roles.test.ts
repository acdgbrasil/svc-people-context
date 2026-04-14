import { describe, it, expect } from "bun:test";
import { Elysia } from "elysia";
import { createPeopleRoutes } from "../../src/routes/people.ts";
import { createRolesRoutes } from "../../src/routes/roles.ts";
import { createFakePersonRepository, createFakeRoleRepository } from "./fake-repositories.ts";
import { createFakeAuthGuard } from "./fake-auth.ts";
import { createFakePublisher } from "./fake-publisher.ts";
import { createNoopZitadelClient } from "../../src/zitadel/index.ts";
import { parseJson, dataAs, dataAsArray, type IdData, type RoleData } from "./test-types.ts";

const setup = () => {
  const people = createFakePersonRepository();
  const roles = createFakeRoleRepository();
  const guard = createFakeAuthGuard();
  const publisher = createFakePublisher();
  const zitadel = createNoopZitadelClient();
  const app = new Elysia()
    .use(createPeopleRoutes({ people, guard, publisher, zitadel }))
    .use(createRolesRoutes({ people, roles, guard, publisher, zitadel }));
  return { app, people, roles, publisher };
};

const json = (body: unknown) => ({
  method: "POST" as const,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const createPerson = async (app: ReturnType<typeof setup>["app"]) => {
  const res = await app.handle(
    new Request("http://localhost/api/v1/people", json({ fullName: "Ana Costa", birthDate: "1990-05-15" })),
  );
  return dataAs<IdData>(await parseJson(res)).id;
};

describe("POST /api/v1/people/:personId/roles — UUID validation", () => {
  it("returns 400 for invalid personId UUID", async () => {
    const { app } = setup();
    const res = await app.handle(
      new Request("http://localhost/api/v1/people/not-a-uuid/roles", json({ system: "social-care", role: "patient" })),
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/people/:personId/roles — UUID validation", () => {
  it("returns 400 for invalid personId UUID", async () => {
    const { app } = setup();
    const res = await app.handle(new Request("http://localhost/api/v1/people/not-a-uuid/roles"));
    expect(res.status).toBe(400);
  });
});

describe("PUT deactivate/reactivate — UUID validation", () => {
  it("returns 400 for invalid UUIDs on deactivate", async () => {
    const { app } = setup();
    const res = await app.handle(
      new Request("http://localhost/api/v1/people/not-a-uuid/roles/also-bad/deactivate", { method: "PUT" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid UUIDs on reactivate", async () => {
    const { app } = setup();
    const res = await app.handle(
      new Request("http://localhost/api/v1/people/not-a-uuid/roles/also-bad/reactivate", { method: "PUT" }),
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/people/:personId/roles", () => {
  it("assigns a role and returns 201 with roleAssigned event", async () => {
    const { app, publisher } = setup();
    const personId = await createPerson(app);
    publisher.published.length = 0; // reset after person creation

    const res = await app.handle(
      new Request(`http://localhost/api/v1/people/${personId}/roles`, json({ system: "social-care", role: "patient" })),
    );
    expect(res.status).toBe(201);
    const body = await parseJson(res);
    expect(dataAs<IdData>(body).id).toBeDefined();

    expect(publisher.published.length).toBe(1);
    expect(publisher.published[0]!.subject).toBe("people.role.assigned");
    const eventData = (publisher.published[0]!.payload as { data: { system: string; role: string } }).data;
    expect(eventData.system).toBe("social-care");
    expect(eventData.role).toBe("patient");
  });

  it("returns 204 when role already exists and is active (idempotent, no event)", async () => {
    const { app, publisher } = setup();
    const personId = await createPerson(app);

    await app.handle(
      new Request(`http://localhost/api/v1/people/${personId}/roles`, json({ system: "social-care", role: "patient" })),
    );
    const countBefore = publisher.published.length;

    const res = await app.handle(
      new Request(`http://localhost/api/v1/people/${personId}/roles`, json({ system: "social-care", role: "patient" })),
    );
    expect(res.status).toBe(204);
    // No new event on idempotent call
    expect(publisher.published.length).toBe(countBefore);
  });

  it("returns 404 for unknown person", async () => {
    const { app } = setup();
    const res = await app.handle(
      new Request("http://localhost/api/v1/people/00000000-0000-0000-0000-000000000000/roles", json({ system: "social-care", role: "patient" })),
    );
    expect(res.status).toBe(404);
  });

  it("returns 422 for empty system (schema validation)", async () => {
    const { app } = setup();
    const personId = await createPerson(app);
    const res = await app.handle(
      new Request(`http://localhost/api/v1/people/${personId}/roles`, json({ system: "", role: "patient" })),
    );
    expect(res.status).toBe(422);
  });
});

describe("GET /api/v1/people/:personId/roles", () => {
  it("returns roles for a person", async () => {
    const { app } = setup();
    const personId = await createPerson(app);

    await app.handle(
      new Request(`http://localhost/api/v1/people/${personId}/roles`, json({ system: "social-care", role: "patient" })),
    );
    await app.handle(
      new Request(`http://localhost/api/v1/people/${personId}/roles`, json({ system: "queue-manager", role: "professional" })),
    );

    const res = await app.handle(new Request(`http://localhost/api/v1/people/${personId}/roles`));
    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(dataAsArray<RoleData>(body).length).toBe(2);
  });

  it("returns 404 for unknown person", async () => {
    const { app } = setup();
    const res = await app.handle(new Request("http://localhost/api/v1/people/00000000-0000-0000-0000-000000000000/roles"));
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/v1/people/:personId/roles/:roleId/deactivate", () => {
  it("deactivates a role, returns 204, and publishes roleDeactivated event", async () => {
    const { app, publisher } = setup();
    const personId = await createPerson(app);

    const assignRes = await app.handle(
      new Request(`http://localhost/api/v1/people/${personId}/roles`, json({ system: "social-care", role: "patient" })),
    );
    const roleId = dataAs<IdData>(await parseJson(assignRes)).id;
    publisher.published.length = 0;

    const res = await app.handle(
      new Request(`http://localhost/api/v1/people/${personId}/roles/${roleId}/deactivate`, { method: "PUT" }),
    );
    expect(res.status).toBe(204);

    expect(publisher.published.length).toBe(1);
    expect(publisher.published[0]!.subject).toBe("people.role.deactivated");
    const eventData = (publisher.published[0]!.payload as { data: { system: string; role: string } }).data;
    expect(eventData.system).toBe("social-care");
    expect(eventData.role).toBe("patient");
  });

  it("returns 404 for unknown role", async () => {
    const { app } = setup();
    const personId = await createPerson(app);
    const res = await app.handle(
      new Request(`http://localhost/api/v1/people/${personId}/roles/00000000-0000-0000-0000-000000000000/deactivate`, { method: "PUT" }),
    );
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/v1/people/:personId/roles/:roleId/reactivate", () => {
  it("reactivates a deactivated role and publishes roleReactivated event", async () => {
    const { app, publisher } = setup();
    const personId = await createPerson(app);

    const assignRes = await app.handle(
      new Request(`http://localhost/api/v1/people/${personId}/roles`, json({ system: "social-care", role: "patient" })),
    );
    const roleId = dataAs<IdData>(await parseJson(assignRes)).id;

    await app.handle(
      new Request(`http://localhost/api/v1/people/${personId}/roles/${roleId}/deactivate`, { method: "PUT" }),
    );
    publisher.published.length = 0;

    const res = await app.handle(
      new Request(`http://localhost/api/v1/people/${personId}/roles/${roleId}/reactivate`, { method: "PUT" }),
    );
    expect(res.status).toBe(204);

    expect(publisher.published.length).toBe(1);
    expect(publisher.published[0]!.subject).toBe("people.role.reactivated");
    const eventData = (publisher.published[0]!.payload as { data: { system: string; role: string } }).data;
    expect(eventData.system).toBe("social-care");
    expect(eventData.role).toBe("patient");
  });

  it("returns 404 when role is already active", async () => {
    const { app } = setup();
    const personId = await createPerson(app);

    const assignRes = await app.handle(
      new Request(`http://localhost/api/v1/people/${personId}/roles`, json({ system: "social-care", role: "patient" })),
    );
    const roleId = dataAs<IdData>(await parseJson(assignRes)).id;

    const res = await app.handle(
      new Request(`http://localhost/api/v1/people/${personId}/roles/${roleId}/reactivate`, { method: "PUT" }),
    );
    expect(res.status).toBe(404);
  });
});

describe("GET /api/v1/roles", () => {
  it("queries roles by system", async () => {
    const { app } = setup();
    const personId = await createPerson(app);
    await app.handle(
      new Request(`http://localhost/api/v1/people/${personId}/roles`, json({ system: "social-care", role: "patient" })),
    );

    const res = await app.handle(new Request("http://localhost/api/v1/roles?system=social-care"));
    expect(res.status).toBe(200);
    const body = await parseJson(res);
    const results = dataAsArray<{ role: RoleData }>(body);
    expect(results.length).toBe(1);
    expect(results[0]!.role.system).toBe("social-care");
  });

  it("returns 400 without system parameter", async () => {
    const { app } = setup();
    const res = await app.handle(new Request("http://localhost/api/v1/roles"));
    expect(res.status).toBe(400);
  });
});
