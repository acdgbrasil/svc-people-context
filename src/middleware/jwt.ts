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
  const { introspectUrl, introspectClientId, introspectClientSecret, introspectTimeoutMs } = env.auth;
  if (!introspectUrl || !introspectClientId || !introspectClientSecret) return null;

  const credentials = btoa(`${introspectClientId}:${introspectClientSecret}`);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), introspectTimeoutMs);

  try {
    const response = await fetch(introspectUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `token=${encodeURIComponent(token)}`,
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error(`[jwt] Token introspection failed: HTTP ${response.status}`);
      return null;
    }

    const result = await response.json() as IntrospectionResponse;
    if (!result.active) return null;

    const projectRoles = result[ROLE_CLAIM];
    return projectRoles ? Object.keys(projectRoles) : [];
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      console.error(`[jwt] Token introspection timed out after ${introspectTimeoutMs}ms`);
    } else {
      console.error("[jwt] Token introspection error:", err instanceof Error ? err.message : err);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
};

// ─── JWKS startup validation ───────────────────────────────────

export const validateJwks = async (): Promise<void> => {
  try {
    const response = await fetch(env.auth.jwksUrl, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`JWKS endpoint returned HTTP ${response.status}`);
    }
    const body = await response.json() as { keys?: unknown[] };
    if (!body.keys || !Array.isArray(body.keys) || body.keys.length === 0) {
      throw new Error("JWKS response contains no keys");
    }
    console.log(`[jwt] JWKS validated: ${body.keys.length} key(s) from ${env.auth.jwksUrl}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (env.isProduction) {
      throw new Error(`[jwt] JWKS validation failed — aborting startup: ${message}`);
    }
    console.warn(`[jwt] JWKS validation failed (non-production, continuing): ${message}`);
  }
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

      if (roles.length === 0 && allowedServiceAccounts.has(sub)) {
        const introspectedRoles = await introspectToken(token);
        if (introspectedRoles) {
          roles = introspectedRoles;
        }
      }

      return { sub, roles };
    } catch (err) {
      console.error("[jwt] Token verification failed:", err instanceof Error ? err.message : err);
      return null;
    }
  };
};
