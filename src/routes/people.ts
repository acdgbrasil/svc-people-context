import { Elysia, t } from "elysia";
import type { PersonRepository } from "../repository/person-repository.ts";
import type { AuthGuard } from "../middleware/auth.ts";
import type { EventPublisher } from "../events/publisher.ts";
import type { ZitadelClient } from "../zitadel/index.ts";
import { events } from "../events/publisher.ts";
import { validateCreatePerson, validateUpdatePerson } from "../domain/index.ts";
const timestamp = () => new Date().toISOString();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CPF_RE = /^\d{11}$/;

type PeopleRouteDeps = {
  readonly people: PersonRepository;
  readonly guard: AuthGuard;
  readonly publisher: EventPublisher;
  readonly zitadel: ZitadelClient;
};

const splitFullName = (fullName: string): { givenName: string; familyName: string } => {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { givenName: parts[0]!, familyName: parts[0]! };
  return { givenName: parts[0]!, familyName: parts.slice(1).join(" ") };
};

export const createPeopleRoutes = ({ people, guard, publisher, zitadel }: PeopleRouteDeps) =>
  new Elysia({ prefix: "/api/v1" })
    .post("/people", async ({ body, headers, set }) => {
      const auth = await guard(headers, ["social_worker", "admin"]);
      if (auth.kind !== "ok") { set.status = auth.status; return auth.response; }

      const validation = validateCreatePerson(body);
      if (validation.kind === "error") {
        set.status = 400;
        return { success: false, error: { code: "PEO-001", message: validation.message } };
      }

      if (body.cpf) {
        const existing = await people.findByCpf(body.cpf);
        if (existing) {
          set.status = 201;
          return { data: { id: existing.id }, meta: { timestamp: timestamp() } };
        }
      }

      const person = await people.create(body);

      await publisher.publish(events.personRegistered(auth.actorId, {
        personId: person.id,
        fullName: person.fullName,
        cpf: body.cpf,
        birthDate: body.birthDate,
      }));

      if (body.createLogin && body.email) {
        const { givenName, familyName } = splitFullName(body.fullName);
        const zResult = await zitadel.createUser({
          profile: { givenName, familyName },
          email: { email: body.email, isVerified: false },
          password: body.initialPassword
            ? { password: body.initialPassword, changeRequired: true }
            : undefined,
          metadata: [{ key: "personId", value: person.id }],
        });

        if (zResult.ok) {
          await people.setZitadelUserId(person.id, zResult.data.userId, body.email);
          await publisher.publish(events.userProvisioned(auth.actorId, {
            personId: person.id,
            zitadelUserId: zResult.data.userId,
            email: body.email,
          }));
        } else {
          set.status = 207;
          return {
            data: { id: person.id },
            warnings: [{ code: "ZIT-001", message: `Person created but Zitadel user provisioning failed: ${zResult.message}` }],
            meta: { timestamp: timestamp() },
          };
        }
      }

      set.status = 201;
      return { data: { id: person.id }, meta: { timestamp: timestamp() } };
    }, {
      body: t.Object({
        fullName: t.String({ minLength: 1, maxLength: 200 }),
        cpf: t.Optional(t.String({ pattern: "^\\d{11}$" })),
        birthDate: t.String({ format: "date" }),
        email: t.Optional(t.String({ format: "email" })),
        createLogin: t.Optional(t.Boolean()),
        initialPassword: t.Optional(t.String({ minLength: 8 })),
      }),
    })

    .get("/people", async ({ headers, query, set }) => {
      const auth = await guard(headers, ["social_worker", "owner", "admin"]);
      if (auth.kind !== "ok") { set.status = auth.status; return auth.response; }

      const result = await people.list({
        search: query["search"] ?? undefined,
        cursor: query["cursor"] ?? undefined,
        limit: query["limit"] ? Number(query["limit"]) : undefined,
      });
      return {
        data: result.data,
        meta: {
          timestamp: timestamp(),
          pageSize: result.data.length,
          totalCount: result.totalCount,
          hasMore: result.hasMore,
          nextCursor: result.nextCursor,
        },
      };
    })

    .get("/people/by-cpf/:cpf", async ({ headers, params, set }) => {
      const auth = await guard(headers, ["social_worker", "owner", "admin"]);
      if (auth.kind !== "ok") { set.status = auth.status; return auth.response; }

      if (!CPF_RE.test(params.cpf)) {
        set.status = 400;
        return { success: false, error: { code: "PEO-004", message: "cpf must be exactly 11 digits" } };
      }

      const person = await people.findByCpf(params.cpf);
      if (!person) {
        set.status = 404;
        return { success: false, error: { code: "PEO-002", message: "Person not found" } };
      }
      return { data: person, meta: { timestamp: timestamp() } };
    })

    .get("/people/:personId", async ({ headers, params, set }) => {
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
      return { data: person, meta: { timestamp: timestamp() } };
    })

    .put("/people/:personId", async ({ params, body, headers, set }) => {
      const auth = await guard(headers, ["social_worker", "admin"]);
      if (auth.kind !== "ok") { set.status = auth.status; return auth.response; }

      if (!UUID_RE.test(params.personId)) {
        set.status = 400;
        return { success: false, error: { code: "PEO-003", message: "personId must be a valid UUID" } };
      }

      const validation = validateUpdatePerson(body);
      if (validation.kind === "error") {
        set.status = 400;
        return { success: false, error: { code: "PEO-001", message: validation.message } };
      }

      const updated = await people.update(params.personId, body);
      if (!updated) {
        set.status = 404;
        return { success: false, error: { code: "PEO-002", message: "Person not found" } };
      }

      await publisher.publish(events.personUpdated(auth.actorId, {
        personId: params.personId,
        fullName: body.fullName,
        cpf: body.cpf,
        birthDate: body.birthDate,
      }));

      set.status = 204;
    }, {
      body: t.Object({
        fullName: t.String({ minLength: 1, maxLength: 200 }),
        cpf: t.Optional(t.String({ pattern: "^\\d{11}$" })),
        birthDate: t.String({ format: "date" }),
      }),
    })

    // ─── Deactivate person + Zitadel user ────────────────────────
    .put("/people/:personId/deactivate", async ({ params, headers, set }) => {
      const auth = await guard(headers, ["admin"]);
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

      const deactivated = await people.deactivate(params.personId);
      if (!deactivated) {
        set.status = 409;
        return { success: false, error: { code: "PEO-005", message: "Person is already inactive" } };
      }

      if (person.zitadelUserId) {
        const zResult = await zitadel.deactivateUser(person.zitadelUserId);
        if (!zResult.ok) {
          await people.reactivate(params.personId);
          set.status = 502;
          return { success: false, error: { code: "ZIT-002", message: `Failed to deactivate Zitadel user: ${zResult.message}` } };
        }
        await publisher.publish(events.userDeactivated(auth.actorId, {
          personId: params.personId,
          zitadelUserId: person.zitadelUserId,
        }));
      }

      set.status = 204;
    })

    // ─── Reactivate person + Zitadel user ────────────────────────
    .put("/people/:personId/reactivate", async ({ params, headers, set }) => {
      const auth = await guard(headers, ["admin"]);
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

      const reactivated = await people.reactivate(params.personId);
      if (!reactivated) {
        set.status = 409;
        return { success: false, error: { code: "PEO-006", message: "Person is already active" } };
      }

      if (person.zitadelUserId) {
        const zResult = await zitadel.reactivateUser(person.zitadelUserId);
        if (!zResult.ok) {
          await people.deactivate(params.personId);
          set.status = 502;
          return { success: false, error: { code: "ZIT-003", message: `Failed to reactivate Zitadel user: ${zResult.message}` } };
        }
        await publisher.publish(events.userReactivated(auth.actorId, {
          personId: params.personId,
          zitadelUserId: person.zitadelUserId,
        }));
      }

      set.status = 204;
    })

    // ─── Request password reset (proxy to Zitadel) ───────────────
    .post("/people/:personId/request-password-reset", async ({ params, headers, set }) => {
      const auth = await guard(headers, ["admin"]);
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

      if (!person.zitadelUserId) {
        set.status = 422;
        return { success: false, error: { code: "PEO-007", message: "Person has no Zitadel login" } };
      }

      const zResult = await zitadel.requestPasswordReset(person.zitadelUserId);
      if (!zResult.ok) {
        set.status = 502;
        return { success: false, error: { code: "ZIT-004", message: `Failed to request password reset: ${zResult.message}` } };
      }

      await publisher.publish(events.passwordResetRequested(auth.actorId, {
        personId: params.personId,
        zitadelUserId: person.zitadelUserId,
      }));

      set.status = 204;
    });
