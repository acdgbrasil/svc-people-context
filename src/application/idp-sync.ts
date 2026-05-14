// Application layer — orquestracao entre routes e AuthentikClient.
//
// Resolve Architecture HIGH-1 (review 2026-05-13): routes nao devem conter
// logica de orquestracao IdP duplicada. As funcoes aqui sao puras e testaveis
// isoladamente, importadas pelas routes para manter handlers thin.
//
// Aderencia ao CLAUDE.md do people-context: pure functions, sem class,
// `Result<T>` ja vem do AuthentikClient.

import type {
  ACDGUserAttributes,
  AuthentikClient,
  AuthentikGroupPk,
  AuthentikResult,
  AuthentikUserPk,
  AuthentikUserUid,
} from "../idp/index.ts";

// ─── Convencao role → group ────────────────────────────────────
//
// (system, role) e mapeado para um Group homonimo no Authentik.
// Ex: system="social-care", role="admin" → group name "social-care:admin"
//
// O group precisa existir no Authentik (criacao via blueprint, conforme
// ADR-029). Se nao existir, role-sync e best-effort: log + skip, mas o
// state local no Postgres do people-context sempre persiste.

export const roleKeyForGroup = (system: string, role: string): string =>
  `${system}:${role}`;

// ─── Helpers para routes ───────────────────────────────────────

// Resolve um (system, role) para o pk do Group correspondente no Authentik.
// Retorna null se grupo nao existe (best-effort + warning log).
export const findGroupByRoleKey = async (
  idp: AuthentikClient,
  system: string,
  role: string,
): Promise<AuthentikGroupPk | null> => {
  const key = roleKeyForGroup(system, role);
  const result = await idp.findGroupByName(key);
  if (!result.ok || result.data === null) {
    console.warn(`[idp] group '${key}' nao encontrado no Authentik — role-sync pulado`);
    return null;
  }
  return result.data.pk;
};

// Sincroniza atribuicao de role (add user ao group correspondente).
// Code-review HIGH-2: Result e tratado (nao silenciado).
export const syncRoleAssignment = async (
  idp: AuthentikClient,
  args: {
    readonly system: string;
    readonly role: string;
    readonly idpUserPk: number;
    readonly personId: string;
  },
): Promise<void> => {
  const groupPk = await findGroupByRoleKey(idp, args.system, args.role);
  if (groupPk === null) return;

  const sync = await idp.addUserToGroup(groupPk, args.idpUserPk);
  if (!sync.ok) {
    console.warn(
      `[idp] role-sync addUserToGroup failed personId=${args.personId} ` +
      `group=${groupPk} code=${sync.code}: ${sync.message}`,
    );
  }
};

// Sincroniza remocao de role (remove user do group correspondente).
export const syncRoleRemoval = async (
  idp: AuthentikClient,
  args: {
    readonly system: string;
    readonly role: string;
    readonly idpUserPk: number;
    readonly personId: string;
  },
): Promise<void> => {
  const groupPk = await findGroupByRoleKey(idp, args.system, args.role);
  if (groupPk === null) return;

  const sync = await idp.removeUserFromGroup(groupPk, args.idpUserPk);
  if (!sync.ok) {
    console.warn(
      `[idp] role-sync removeUserFromGroup failed personId=${args.personId} ` +
      `group=${groupPk} code=${sync.code}: ${sync.message}`,
    );
  }
};

// ─── Username derivation ───────────────────────────────────────

// Derive username estavel a partir do email (parte antes do @).
// Code-review MEDIUM-15: colisoes silenciosas possiveis (`joao@x.com` e
// `joao@y.com` produzem mesmo username). Authentik vai rejeitar o segundo
// com 409 unique constraint — capturado como warning IDP-001.
export const usernameFromEmail = (email: string): string =>
  email.split("@")[0]?.toLowerCase() ?? email.toLowerCase();

// ─── Provision user no IdP ─────────────────────────────────────
//
// Resolve Architecture M1 (review 2026-05-13): routes nao mais chamam
// `idp.createUser` + `idp.setPassword` separadamente; usam esta funcao
// que orquestra os dois passos atomicamente do ponto de vista da route.
//
// Erros do setPassword sao logados como warning (HIGH-3 — Result tratado)
// mas nao falham o provision: usuario ja foi criado, falta apenas a senha
// inicial (recuperavel via recovery flow).

export type ProvisionUserInput = {
  readonly username: string;
  readonly name: string;
  readonly email: string;
  readonly initialPassword?: string;
  readonly attributes: ACDGUserAttributes;
};

export type ProvisionedUser = {
  readonly uid: AuthentikUserUid;
  readonly pk: AuthentikUserPk;
};

export const provisionUserInIdp = async (
  idp: AuthentikClient,
  input: ProvisionUserInput,
): Promise<AuthentikResult<ProvisionedUser>> => {
  const createResult = await idp.createUser({
    username: input.username,
    name: input.name,
    email: input.email,
    is_active: true,
    path: "users",
    type: "internal",
    attributes: input.attributes,
  });

  if (!createResult.ok) return createResult;

  if (input.initialPassword) {
    const pwdResult = await idp.setPassword(createResult.data.pk, input.initialPassword);
    if (!pwdResult.ok) {
      console.warn(
        `[idp] setPassword failed for pk=${createResult.data.pk} ` +
        `code=${pwdResult.code} — user criado, senha inicial nao aplicada (recuperavel via recovery)`,
      );
    }
  }

  return {
    ok: true,
    data: { uid: createResult.data.uid, pk: createResult.data.pk },
  };
};
