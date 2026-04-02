import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { env } from "../config/env.ts";

// ─── Types ──────────────────────────────────────────────────────

type ZitadelRoles = Record<string, Record<string, string>>;

export type AuthContext = {
  readonly sub: string;
  readonly roles: readonly string[];
};

export type JwtVerifier = (token: string) => Promise<AuthContext | null>;

// ─── Role claim extraction ──────────────────────────────────────

const ROLE_CLAIM = "urn:zitadel:iam:org:project:roles";

const extractRoles = (payload: JWTPayload): readonly string[] => {
  const rolesObj = payload[ROLE_CLAIM] as ZitadelRoles | undefined;
  if (!rolesObj || typeof rolesObj !== "object") return [];
  return Object.keys(rolesObj);
};

// ─── Token introspection (RFC 7662) — fallback for service accounts ─

type IntrospectionResponse = {
  readonly active: boolean;
  readonly "urn:zitadel:iam:org:project:roles"?: ZitadelRoles;
};

const introspectToken = async (token: string): Promise<readonly string[] | null> => {
  const { introspectUrl, introspectClientId, introspectClientSecret } = env.auth;
  if (!introspectUrl || !introspectClientId || !introspectClientSecret) return null;

  const credentials = btoa(`${introspectClientId}:${introspectClientSecret}`);

  const response = await fetch(introspectUrl, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `token=${encodeURIComponent(token)}`,
  });

  if (!response.ok) return null;

  const result = await response.json() as IntrospectionResponse;
  if (!result.active) return null;

  const projectRoles = result[ROLE_CLAIM];
  return projectRoles ? Object.keys(projectRoles) : [];
};

// ─── Factory ────────────────────────────────────────────────────

export const createJwtVerifier = (): JwtVerifier => {
  const jwks = createRemoteJWKSet(new URL(env.auth.jwksUrl));
  const allowedServiceAccounts = new Set(env.auth.allowedServiceAccounts);

  return async (token: string): Promise<AuthContext | null> => {
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: env.auth.issuer,
      });

      const sub = payload.sub;
      if (!sub) return null;

      let roles = extractRoles(payload);

      // Fallback: if JWT has no roles, try token introspection
      // Only for service accounts in the allowlist (prevents escalation)
      if (roles.length === 0 && allowedServiceAccounts.has(sub)) {
        const introspectedRoles = await introspectToken(token);
        if (introspectedRoles) {
          roles = introspectedRoles;
        }
      }

      return { sub, roles };
    } catch {
      return null;
    }
  };
};
