import type {
  ZitadelClient,
  ZitadelResult,
  CreateHumanUserRequest,
  UserGrantRequest,
} from "./types.ts";

// ─── Config ────────────────────────────────────────────────────

type ZitadelClientConfig = {
  readonly baseUrl: string;
  readonly token: string;
};

// ─── HTTP helper (never throws) ────────────────────────────────

const request = async <T>(
  config: ZitadelClientConfig,
  method: string,
  path: string,
  body?: unknown,
): Promise<ZitadelResult<T>> => {
  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      method,
      headers: {
        "Authorization": `Bearer ${config.token}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (response.ok) {
      if (response.status === 204 || response.headers.get("content-length") === "0") {
        return { ok: true, data: undefined as T };
      }
      const data = await response.json() as T;
      return { ok: true, data };
    }

    const errorBody = await response.text();
    let message: string;
    try {
      const parsed = JSON.parse(errorBody) as { message?: string; error?: string };
      message = parsed.message ?? parsed.error ?? errorBody;
    } catch {
      message = errorBody;
    }

    return { ok: false, code: response.status, message };
  } catch (err) {
    return { ok: false, code: 0, message: err instanceof Error ? err.message : "Unknown network error" };
  }
};

// ─── Factory ───────────────────────────────────────────────────

export const createZitadelClient = (config: ZitadelClientConfig): ZitadelClient => ({
  createUser: (input: CreateHumanUserRequest) =>
    request(config, "POST", "/v2/users/human", {
      profile: input.profile,
      email: input.email,
      password: input.password,
      metadata: input.metadata?.map((m) => ({
        key: btoa(m.key),
        value: btoa(m.value),
      })),
    }),

  deactivateUser: (userId: string) =>
    request(config, "POST", `/v2/users/${userId}/deactivate`),

  reactivateUser: (userId: string) =>
    request(config, "POST", `/v2/users/${userId}/reactivate`),

  deleteUser: (userId: string) =>
    request(config, "DELETE", `/v2/users/${userId}`),

  requestPasswordReset: async (userId: string) => {
    const result = await request<{ readonly verificationCode?: string }>(
      config, "POST", `/v2/users/${userId}/password_reset`, { sendLink: {} },
    );
    if (!result.ok) return result;
    return { ok: true as const, data: { link: result.data.verificationCode ?? null } };
  },

  addUserGrant: (input: UserGrantRequest) =>
    request(config, "POST", "/v1/users/" + input.userId + "/grants", {
      projectId: input.projectId,
      roleKeys: input.roleKeys,
    }),

  removeUserGrant: (userId: string, grantId: string) =>
    request(config, "DELETE", `/v1/users/${userId}/grants/${grantId}`),

  listUserGrants: (userId: string, projectId: string) =>
    request(config, "POST", "/v1/users/" + userId + "/grants/_search", {
      queries: [
        { projectIdQuery: { projectId } },
      ],
    }),
});

// ─── Noop client (for testing or when Zitadel is disabled) ─────

export const createNoopZitadelClient = (): ZitadelClient => ({
  createUser: async () => ({ ok: true, data: { userId: "noop-" + crypto.randomUUID() } }),
  deactivateUser: async () => ({ ok: true, data: undefined }),
  reactivateUser: async () => ({ ok: true, data: undefined }),
  deleteUser: async () => ({ ok: true, data: undefined }),
  requestPasswordReset: async () => ({ ok: true, data: { link: null } }),
  addUserGrant: async () => ({ ok: true, data: { userGrantId: "noop-grant" } }),
  removeUserGrant: async () => ({ ok: true, data: undefined }),
  listUserGrants: async () => ({ ok: true, data: { result: [] } }),
});
