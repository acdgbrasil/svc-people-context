// ─── Raw env reading ───────────────────────────────────────────

const isProduction = process.env["NODE_ENV"] === "production";

const requireInProd = (key: string, fallback: string): string => {
  const value = process.env[key];
  if (value) return value;
  if (isProduction) throw new Error(`[env] ${key} is required in production`);
  return fallback;
};

export const env = {
  port: Number(process.env["PORT"] ?? 3000),
  host: process.env["SERVER_HOST"] ?? "0.0.0.0",
  isProduction,

  db: {
    host: requireInProd("DB_HOST", "localhost"),
    port: Number(process.env["DB_PORT"] ?? 5432),
    user: requireInProd("DB_USER", "postgres"),
    password: requireInProd("DB_PASSWORD", "postgres"),
    database: process.env["DB_NAME"] ?? "people",
  },

  auth: {
    jwksUrl: requireInProd("JWKS_URL", "https://auth.acdgbrasil.com.br/oauth/v2/keys"),
    issuer: requireInProd("ZITADEL_ISSUER", "https://auth.acdgbrasil.com.br"),
    introspectUrl: process.env["ZITADEL_INTROSPECT_URL"],
    introspectClientId: process.env["ZITADEL_INTROSPECT_CLIENT_ID"],
    introspectClientSecret: process.env["ZITADEL_INTROSPECT_CLIENT_SECRET"],
    allowedServiceAccounts: process.env["ALLOWED_SERVICE_ACCOUNTS"]
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? [],
    introspectTimeoutMs: Number(process.env["INTROSPECT_TIMEOUT_MS"] ?? 5000),
  },

  nats: {
    url: process.env["NATS_URL"],
  },
} as const;
