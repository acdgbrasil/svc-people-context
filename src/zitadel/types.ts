// ─── Zitadel Management API types ──────────────────────────────
// Minimal typed subset covering user + role operations.

// ─── Requests ──────────────────────────────────────────────────

export type CreateHumanUserRequest = {
  readonly profile: {
    readonly givenName: string;
    readonly familyName: string;
  };
  readonly email: {
    readonly email: string;
    readonly isVerified: boolean;
  };
  readonly password?: {
    readonly password: string;
    readonly changeRequired: boolean;
  };
  readonly metadata?: readonly {
    readonly key: string;
    readonly value: string;
  }[];
};

export type UserGrantRequest = {
  readonly userId: string;
  readonly projectId: string;
  readonly roleKeys: readonly string[];
};

// ─── Responses ─────────────────────────────────────────────────

export type CreateUserResponse = {
  readonly userId: string;
};

export type UserGrantResponse = {
  readonly userGrantId: string;
};

export type UserGrantDetail = {
  readonly id: string;
  readonly userId: string;
  readonly projectId: string;
  readonly roleKeys: readonly string[];
};

export type ListUserGrantsResponse = {
  readonly result: readonly UserGrantDetail[];
};

// ─── Client contract ───────────────────────────────────────────

export type ZitadelClient = {
  readonly createUser: (input: CreateHumanUserRequest) => Promise<ZitadelResult<CreateUserResponse>>;
  readonly deactivateUser: (userId: string) => Promise<ZitadelResult<void>>;
  readonly reactivateUser: (userId: string) => Promise<ZitadelResult<void>>;
  readonly deleteUser: (userId: string) => Promise<ZitadelResult<void>>;
  readonly requestPasswordReset: (userId: string) => Promise<ZitadelResult<{ readonly link: string | null }>>;
  readonly addUserGrant: (input: UserGrantRequest) => Promise<ZitadelResult<UserGrantResponse>>;
  readonly removeUserGrant: (userId: string, grantId: string) => Promise<ZitadelResult<void>>;
  readonly listUserGrants: (userId: string, projectId: string) => Promise<ZitadelResult<ListUserGrantsResponse>>;
};

// ─── Result type (no throw) ────────────────────────────────────

export type ZitadelResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly code: number; readonly message: string };
