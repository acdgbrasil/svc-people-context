import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { createAuthentikClient, createNoopAuthentikClient } from "../../src/idp/index.ts";
import type { AuthentikUserPk } from "../../src/idp/index.ts";

// ─── Unit tests com fetch mockado ──────────────────────────────

describe("createAuthentikClient (unit, fetch mockado)", () => {
  const setupMockFetch = (response: {
    status: number;
    body: unknown;
    headers?: Record<string, string>;
  }) => {
    const original = globalThis.fetch;
    const mocked = (async () => {
      const isJson = typeof response.body !== "string";
      const body = isJson ? JSON.stringify(response.body) : (response.body as string);
      return new Response(body, {
        status: response.status,
        headers: { "Content-Type": "application/json", ...response.headers },
      });
    }) as unknown as typeof fetch;
    globalThis.fetch = mocked;
    return () => {
      globalThis.fetch = original;
    };
  };

  it("converte 200 + JSON em Result ok", async () => {
    const restore = setupMockFetch({
      status: 200,
      body: {
        pk: 42,
        uid: "abc123",
        username: "joao",
        name: "Joao",
        email: "j@x.com",
        is_active: true,
        is_superuser: false,
        groups: [],
        attributes: {},
        date_joined: "2026-05-13T00:00:00Z",
        last_login: null,
      },
    });

    const client = createAuthentikClient({ baseUrl: "http://x", token: "t" });
    const result = await client.getUser(42);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.pk).toBe(42);
      expect(result.data.username).toBe("joao");
    }
    restore();
  });

  it("converte 204 No Content em Result ok com data undefined", async () => {
    const restore = setupMockFetch({
      status: 204,
      body: "",
      headers: { "content-length": "0" },
    });

    const client = createAuthentikClient({ baseUrl: "http://x", token: "t" });
    const result = await client.setPassword(1, "nova-senha");

    expect(result.ok).toBe(true);
    restore();
  });

  it("converte 4xx em Result error com code e message do detail/error_description", async () => {
    const restore = setupMockFetch({
      status: 415,
      body: { detail: "Tipo de mídia não suportado." },
    });

    const client = createAuthentikClient({ baseUrl: "http://x", token: "t" });
    const result = await client.getUser(1);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(415);
      expect(result.message).toBe("Tipo de mídia não suportado.");
    }
    restore();
  });

  it("converte network error em Result error code 0", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;

    const client = createAuthentikClient({ baseUrl: "http://x", token: "t" });
    const result = await client.getUser(1);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(0);
      expect(result.message).toBe("ECONNREFUSED");
    }
    globalThis.fetch = original;
  });

  it("findUserByUsername retorna null quando results vazio", async () => {
    const restore = setupMockFetch({
      status: 200,
      body: { results: [], pagination: { count: 0 } },
    });

    const client = createAuthentikClient({ baseUrl: "http://x", token: "t" });
    const result = await client.findUserByUsername("nao-existe");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toBeNull();
    restore();
  });

  it("findGroupByName retorna o primeiro group encontrado", async () => {
    const restore = setupMockFetch({
      status: 200,
      body: {
        results: [
          { pk: "uuid-1", name: "social_worker", is_superuser: false },
        ],
        pagination: { count: 1 },
      },
    });

    const client = createAuthentikClient({ baseUrl: "http://x", token: "t" });
    const result = await client.findGroupByName("social_worker");

    expect(result.ok).toBe(true);
    if (result.ok && result.data) {
      expect(result.data.pk).toBe("uuid-1");
      expect(result.data.name).toBe("social_worker");
    }
    restore();
  });
});

// ─── Noop client ───────────────────────────────────────────────

describe("createNoopAuthentikClient", () => {
  it("retorna sucesso para todas operacoes (uso em testes)", async () => {
    const client = createNoopAuthentikClient();

    const create = await client.createUser({
      username: "test",
      name: "Test",
      email: "test@example.com",
    });
    expect(create.ok).toBe(true);
    if (create.ok) expect(create.data.username).toBe("test");

    const recovery = await client.requestPasswordReset(1);
    expect(recovery.ok).toBe(true);
    if (recovery.ok) expect(recovery.data.link).toContain("noop");

    const sa = await client.createServiceAccount({ name: "svc-test" });
    expect(sa.ok).toBe(true);
    if (sa.ok) expect(sa.data.token).toContain("noop-token-");
  });
});

// ─── Smoke tests contra instancia local (auth-spike) ───────────
//
// Pulados se AUTHENTIK_URL nao setado. Para rodar:
//   AUTHENTIK_URL=http://localhost:9000 \
//   AUTHENTIK_TOKEN=<token do .env do spike> \
//     bun test tests/idp/

const AUTHENTIK_URL = process.env["AUTHENTIK_URL"];
const AUTHENTIK_TOKEN = process.env["AUTHENTIK_TOKEN"];
const live = AUTHENTIK_URL !== undefined && AUTHENTIK_TOKEN !== undefined;

describe.skipIf(!live)(
  "createAuthentikClient (smoke contra instancia real)",
  () => {
    const client = createAuthentikClient({
      baseUrl: AUTHENTIK_URL ?? "",
      token: AUTHENTIK_TOKEN ?? "",
    });

    let saUserPk: AuthentikUserPk | undefined;
    const saName = `acdg-smoke-${Date.now()}`;

    beforeAll(async () => {
      // Garantir que existe um group `social_worker` (criado no spike)
      const group = await client.findGroupByName("social_worker");
      expect(group.ok).toBe(true);
    });

    afterAll(async () => {
      if (saUserPk !== undefined) {
        await client.deleteUser(saUserPk);
      }
    });

    it("createServiceAccount retorna token + user_pk", async () => {
      const result = await client.createServiceAccount({
        name: saName,
        create_group: false,
        expiring: true,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.username).toBe(saName);
        expect(result.data.token.length).toBeGreaterThan(20);
        expect(result.data.user_pk).toBeGreaterThan(0);
        saUserPk = result.data.user_pk;
      }
    });

    it("getUser recupera por pk", async () => {
      if (saUserPk === undefined) throw new Error("SA nao criada");
      const result = await client.getUser(saUserPk);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.username).toBe(saName);
      }
    });

    it("updateUserAttributes persiste org_id + person_id", async () => {
      if (saUserPk === undefined) throw new Error("SA nao criada");
      const result = await client.updateUserAttributes(saUserPk, {
        org_id: "acdg-default",
        person_id: "01HXTEST",
        legacy_zitadel_sub: "270366000000000000",
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.attributes["org_id"]).toBe("acdg-default");
        expect(result.data.attributes["person_id"]).toBe("01HXTEST");
      }
    });

    it("addUserToGroup + listUserGroups + removeUserFromGroup", async () => {
      if (saUserPk === undefined) throw new Error("SA nao criada");

      const group = await client.findGroupByName("social_worker");
      expect(group.ok).toBe(true);
      if (!group.ok || !group.data) throw new Error("group social_worker nao existe");
      const groupPk = group.data.pk;

      const add = await client.addUserToGroup(groupPk, saUserPk);
      expect(add.ok).toBe(true);

      const list = await client.listUserGroups(saUserPk);
      expect(list.ok).toBe(true);
      if (list.ok) {
        expect(list.data.some((g) => g.name === "social_worker")).toBe(true);
      }

      const remove = await client.removeUserFromGroup(groupPk, saUserPk);
      expect(remove.ok).toBe(true);
    });

    it("deactivateUser + reactivateUser idempotentes", async () => {
      if (saUserPk === undefined) throw new Error("SA nao criada");

      const off = await client.deactivateUser(saUserPk);
      expect(off.ok).toBe(true);

      const check1 = await client.getUser(saUserPk);
      if (check1.ok) expect(check1.data.is_active).toBe(false);

      const on = await client.reactivateUser(saUserPk);
      expect(on.ok).toBe(true);

      const check2 = await client.getUser(saUserPk);
      if (check2.ok) expect(check2.data.is_active).toBe(true);
    });

    it("requestPasswordReset retorna link valido para o acdg-recovery-flow", async () => {
      if (saUserPk === undefined) throw new Error("SA nao criada");
      const result = await client.requestPasswordReset(saUserPk);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.link).toContain("/if/flow/acdg-recovery-flow/");
        expect(result.data.link).toContain("flow_token=");
      }
    });
  },
);
