import { Elysia, t } from "elysia";
import type { PersonRepository } from "../repository/person-repository.ts";
import type { RoleRepository } from "../repository/role-repository.ts";
import type { AuthGuard } from "../middleware/auth.ts";
import type { EventPublisher } from "../events/publisher.ts";
import type { ZitadelClient } from "../zitadel/index.ts";
import { events } from "../events/publisher.ts";
import { validateAssignRole } from "../domain/index.ts";
import { env } from "../config/env.ts";

const timestamp = () => new Date().toISOString();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RolesRouteDeps = {
  readonly people: PersonRepository;
  readonly roles: RoleRepository;
  readonly guard: AuthGuard;
  readonly publisher: EventPublisher;
  readonly zitadel: ZitadelClient;
};

export const createRolesRoutes = ({ people, roles, guard, publisher, zitadel }: RolesRouteDeps) =>
  new Elysia({ prefix: "/api/v1" })
    .post("/people/:personId/roles", async ({ params, body, headers, set }) => {
      const auth = await guard(headers, ["social_worker", "admin"]);
      if (auth.kind !== "ok") { set.status = auth.status; return auth.response; }

      if (!UUID_RE.test(params.personId)) {
        set.status = 400;
        return { success: false, error: { code: "PEO-003", message: "personId must be a valid UUID" } };
      }

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

      // Sync role to Zitadel if person has a login
      if (person.zitadelUserId && env.zitadel.projectId) {
        await zitadel.addUserGrant({
          userId: person.zitadelUserId,
          projectId: env.zitadel.projectId,
          roleKeys: [`${body.system}:${body.role}`],
        });
      }

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

      if (!UUID_RE.test(params.personId)) {
        set.status = 400;
        return { success: false, error: { code: "PEO-003", message: "personId must be a valid UUID" } };
      }

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

      if (!UUID_RE.test(params.personId) || !UUID_RE.test(params.roleId)) {
        set.status = 400;
        return { success: false, error: { code: "ROL-005", message: "personId and roleId must be valid UUIDs" } };
      }

      const person = await people.findById(params.personId);

      const deactivated = await roles.deactivate(params.personId, params.roleId);
      if (!deactivated) {
        set.status = 404;
        return { success: false, error: { code: "ROL-002", message: "Active role not found" } };
      }

      await publisher.publish(events.roleDeactivated(auth.actorId, {
        personId: params.personId,
        system: deactivated.system,
        role: deactivated.role,
      }));

      // Remove matching grant from Zitadel
      if (person?.zitadelUserId && env.zitadel.projectId) {
        const grantsResult = await zitadel.listUserGrants(person.zitadelUserId, env.zitadel.projectId);
        if (grantsResult.ok) {
          const roleKey = `${deactivated.system}:${deactivated.role}`;
          const grant = grantsResult.data.result.find((g) => g.roleKeys.includes(roleKey));
          if (grant) {
            await zitadel.removeUserGrant(person.zitadelUserId, grant.id);
          }
        }
      }

      set.status = 204;
    })

    .put("/people/:personId/roles/:roleId/reactivate", async ({ params, headers, set }) => {
      const auth = await guard(headers, ["admin"]);
      if (auth.kind !== "ok") { set.status = auth.status; return auth.response; }

      if (!UUID_RE.test(params.personId) || !UUID_RE.test(params.roleId)) {
        set.status = 400;
        return { success: false, error: { code: "ROL-005", message: "personId and roleId must be valid UUIDs" } };
      }

      const person = await people.findById(params.personId);

      const reactivated = await roles.reactivate(params.personId, params.roleId);
      if (!reactivated) {
        set.status = 404;
        return { success: false, error: { code: "ROL-003", message: "Inactive role not found" } };
      }

      await publisher.publish(events.roleReactivated(auth.actorId, {
        personId: params.personId,
        system: reactivated.system,
        role: reactivated.role,
      }));

      // Re-add grant in Zitadel
      if (person?.zitadelUserId && env.zitadel.projectId) {
        await zitadel.addUserGrant({
          userId: person.zitadelUserId,
          projectId: env.zitadel.projectId,
          roleKeys: [`${reactivated.system}:${reactivated.role}`],
        });
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
