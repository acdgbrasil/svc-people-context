import type {
  AuthentikClient,
  AuthentikGroupPk,
  AuthentikResult,
  AuthentikUserPk,
  GroupSummary,
  UserResponse,
} from "../../src/idp/index.ts";

// Fake AuthentikClient configurável para testar paths de sucesso e falha
// nas rotas sem mockar globalmente o `fetch`.

const ok = <T>(data: T): AuthentikResult<T> => ({ ok: true, data });
const err = (code: number, message = "fake error"): AuthentikResult<never> =>
  ({ ok: false, code, message });

const stubUser = (overrides: Partial<UserResponse> = {}): UserResponse => ({
  pk: 1,
  uid: "fake-uid",
  username: "fake",
  name: "Fake User",
  email: "fake@example.com",
  is_active: true,
  is_superuser: false,
  groups: [],
  attributes: {},
  date_joined: new Date().toISOString(),
  last_login: null,
  ...overrides,
});

export type FakeAuthentikOverrides = {
  readonly createUserFails?: { code: number; message?: string };
  readonly setPasswordFails?: { code: number; message?: string };
  readonly deactivateFails?: { code: number; message?: string };
  readonly reactivateFails?: { code: number; message?: string };
  readonly requestPasswordResetFails?: { code: number; message?: string };
  readonly findGroupReturnsNull?: boolean;
  readonly addUserToGroupFails?: { code: number; message?: string };
  readonly removeUserFromGroupFails?: { code: number; message?: string };
  readonly createUserPk?: number;
  readonly createUserUid?: string;
  readonly recoveryLink?: string | null;
};

export type FakeAuthentikClient = AuthentikClient & {
  readonly calls: {
    readonly createUser: Array<unknown>;
    readonly setPassword: Array<{ pk: AuthentikUserPk; password: string }>;
    readonly deactivateUser: AuthentikUserPk[];
    readonly reactivateUser: AuthentikUserPk[];
    readonly requestPasswordReset: AuthentikUserPk[];
    readonly addUserToGroup: Array<{ groupPk: AuthentikGroupPk; userPk: AuthentikUserPk }>;
    readonly removeUserFromGroup: Array<{ groupPk: AuthentikGroupPk; userPk: AuthentikUserPk }>;
    readonly findGroupByName: string[];
  };
};

export const createFakeAuthentikClient = (
  overrides: FakeAuthentikOverrides = {},
): FakeAuthentikClient => {
  const calls = {
    createUser: [] as Array<unknown>,
    setPassword: [] as Array<{ pk: AuthentikUserPk; password: string }>,
    deactivateUser: [] as AuthentikUserPk[],
    reactivateUser: [] as AuthentikUserPk[],
    requestPasswordReset: [] as AuthentikUserPk[],
    addUserToGroup: [] as Array<{ groupPk: AuthentikGroupPk; userPk: AuthentikUserPk }>,
    removeUserFromGroup: [] as Array<{ groupPk: AuthentikGroupPk; userPk: AuthentikUserPk }>,
    findGroupByName: [] as string[],
  };

  const groupStub: GroupSummary = {
    pk: "00000000-0000-0000-0000-000000000099",
    name: "fake-group",
    is_superuser: false,
  };

  return {
    calls,

    createUser: async (input) => {
      calls.createUser.push(input);
      if (overrides.createUserFails) {
        return err(overrides.createUserFails.code, overrides.createUserFails.message);
      }
      return ok(stubUser({
        pk: overrides.createUserPk ?? 42,
        uid: overrides.createUserUid ?? "uid-42",
        username: input.username,
        name: input.name,
        email: input.email,
      }));
    },

    getUser: async (pk) => ok(stubUser({ pk })),
    findUserByUsername: async () => ok(null),
    findUserByUid: async () => ok(null),

    setPassword: async (pk, password) => {
      calls.setPassword.push({ pk, password });
      if (overrides.setPasswordFails) {
        return err(overrides.setPasswordFails.code, overrides.setPasswordFails.message);
      }
      return ok(undefined);
    },

    deactivateUser: async (pk) => {
      calls.deactivateUser.push(pk);
      if (overrides.deactivateFails) {
        return err(overrides.deactivateFails.code, overrides.deactivateFails.message);
      }
      return ok(undefined);
    },

    reactivateUser: async (pk) => {
      calls.reactivateUser.push(pk);
      if (overrides.reactivateFails) {
        return err(overrides.reactivateFails.code, overrides.reactivateFails.message);
      }
      return ok(undefined);
    },

    deleteUser: async () => ok(undefined),
    updateUserAttributes: async (pk) => ok(stubUser({ pk })),

    requestPasswordReset: async (pk) => {
      calls.requestPasswordReset.push(pk);
      if (overrides.requestPasswordResetFails) {
        return err(
          overrides.requestPasswordResetFails.code,
          overrides.requestPasswordResetFails.message,
        );
      }
      return ok({ link: overrides.recoveryLink ?? "https://fake/recovery?token=t" });
    },

    findGroupByName: async (name) => {
      calls.findGroupByName.push(name);
      if (overrides.findGroupReturnsNull) return ok(null);
      return ok({ ...groupStub, name });
    },

    addUserToGroup: async (groupPk, userPk) => {
      calls.addUserToGroup.push({ groupPk, userPk });
      if (overrides.addUserToGroupFails) {
        return err(overrides.addUserToGroupFails.code, overrides.addUserToGroupFails.message);
      }
      return ok(undefined);
    },

    removeUserFromGroup: async (groupPk, userPk) => {
      calls.removeUserFromGroup.push({ groupPk, userPk });
      if (overrides.removeUserFromGroupFails) {
        return err(
          overrides.removeUserFromGroupFails.code,
          overrides.removeUserFromGroupFails.message,
        );
      }
      return ok(undefined);
    },

    listUserGroups: async () => ok([]),
    createServiceAccount: async (input) => ok({
      username: input.name,
      token: "fake-sa-token",
      user_uid: "sa-uid",
      user_pk: 99,
    }),
  };
};
