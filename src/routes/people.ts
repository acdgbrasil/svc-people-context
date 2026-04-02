import { Elysia, t } from "elysia";
import type { PersonRepository } from "../repository/person-repository.ts";
import type { AuthGuard } from "../middleware/auth.ts";
import type { EventPublisher } from "../events/publisher.ts";
import { events } from "../events/publisher.ts";
import { validateCreatePerson, validateUpdatePerson } from "../domain/index.ts";

const timestamp = () => new Date().toISOString();

type PeopleRouteDeps = {
  readonly people: PersonRepository;
  readonly guard: AuthGuard;
  readonly publisher: EventPublisher;
};

export const createPeopleRoutes = ({ people, guard, publisher }: PeopleRouteDeps) =>
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

      set.status = 201;
      return { data: { id: person.id }, meta: { timestamp: timestamp() } };
    }, {
      body: t.Object({
        fullName: t.String({ minLength: 1, maxLength: 200 }),
        cpf: t.Optional(t.String({ pattern: "^\\d{11}$" })),
        birthDate: t.String({ format: "date" }),
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
    });
