import { Elysia, t } from "elysia";
import type { PersonRepository } from "../repository/person-repository.ts";
import type { RoleRepository } from "../repository/role-repository.ts";
import type { AuthGuard } from "../middleware/auth.ts";
import type { EventPublisher } from "../events/publisher.ts";
import { events } from "../events/publisher.ts";
import { validateAssignRole } from "../domain/index.ts";

const timestamp = () => new Date().toISOString();

type RolesRouteDeps = {
  readonly people: PersonRepository;
  readonly roles: RoleRepository;
  readonly guard: AuthGuard;
  readonly publisher: EventPublisher;
};

export const createRolesRoutes = ({ people, roles, guard, publisher }: RolesRouteDeps) =>
  new Elysia({ prefix: "/api/v1" })
    .post("/people/:personId/roles", async ({ params, body, headers, set }) => {
      const auth = await guard(headers, ["social_worker", "admin"]);
      if (auth.kind !== "ok") { set.status = auth.status; return auth.response; }

      const validation = validateAssignRole(body);
      if (validation.kind === "error") {
        set.status = 400;
        return { success: false, error: { code: "ROL-001", message: validation.message } };
      }

      const person = await people.findById(params.personId);
      if (!person) {
        set.status = 404;
        return { success: false, error: { code: "PEO-002", message: "Person not found" } };
      }

      const { role, created } = await roles.assign(params.personId, body);
      if (!created) {
        set.status = 204;
        return;
      }

      await publisher.publish(events.roleAssigned(auth.actorId, {
        personId: params.personId,
        system: body.system,
        role: body.role,
      }));

      set.status = 201;
      return { data: { id: role.id }, meta: { timestamp: timestamp() } };
    }, {
      body: t.Object({
        system: t.String({ minLength: 1 }),
        role: t.String({ minLength: 1 }),
      }),
    })

    .get("/people/:personId/roles", async ({ headers, params, query, set }) => {
      const auth = await guard(headers, ["social_worker", "owner", "admin"]);
      if (auth.kind !== "ok") { set.status = auth.status; return auth.response; }

      const person = await people.findById(params.personId);
      if (!person) {
        set.status = 404;
        return { success: false, error: { code: "PEO-002", message: "Person not found" } };
      }

      const active = query["active"] !== undefined ? query["active"] === "true" : undefined;
      const result = await roles.listByPerson(params.personId, active);
      return { data: result, meta: { timestamp: timestamp() } };
    })

    .put("/people/:personId/roles/:roleId/deactivate", async ({ params, headers, set }) => {
      const auth = await guard(headers, ["admin"]);
      if (auth.kind !== "ok") { set.status = auth.status; return auth.response; }

      const role = (await roles.listByPerson(params.personId)).find((r) => r.id === params.roleId);
      const ok = await roles.deactivate(params.personId, params.roleId);
      if (!ok) {
        set.status = 404;
        return { success: false, error: { code: "ROL-002", message: "Active role not found" } };
      }

      if (role) {
        await publisher.publish(events.roleDeactivated(auth.actorId, {
          personId: params.personId,
          system: role.system,
          role: role.role,
        }));
      }

      set.status = 204;
    })

    .put("/people/:personId/roles/:roleId/reactivate", async ({ params, headers, set }) => {
      const auth = await guard(headers, ["admin"]);
      if (auth.kind !== "ok") { set.status = auth.status; return auth.response; }

      const role = (await roles.listByPerson(params.personId)).find((r) => r.id === params.roleId);
      const ok = await roles.reactivate(params.personId, params.roleId);
      if (!ok) {
        set.status = 404;
        return { success: false, error: { code: "ROL-003", message: "Inactive role not found" } };
      }

      if (role) {
        await publisher.publish(events.roleReactivated(auth.actorId, {
          personId: params.personId,
          system: role.system,
          role: role.role,
        }));
      }

      set.status = 204;
    })

    .get("/roles", async ({ headers, query, set }) => {
      const auth = await guard(headers, ["social_worker", "owner", "admin"]);
      if (auth.kind !== "ok") { set.status = auth.status; return auth.response; }

      const system = query["system"];
      if (!system) {
        set.status = 400;
        return { success: false, error: { code: "ROL-004", message: "system query parameter is required" } };
      }

      const role = query["role"] ?? undefined;
      const active = query["active"] !== "false";
      const results = await roles.query(system, role, active);
      return { data: results, meta: { timestamp: timestamp() } };
    });
