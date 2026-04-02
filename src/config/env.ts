export const env = {
  port: Number(process.env["PORT"] ?? 3000),
  host: process.env["SERVER_HOST"] ?? "0.0.0.0",

  db: {
    host: process.env["DB_HOST"] ?? "localhost",
    port: Number(process.env["DB_PORT"] ?? 5432),
    user: process.env["DB_USER"] ?? "postgres",
    password: process.env["DB_PASSWORD"] ?? "postgres",
    database: process.env["DB_NAME"] ?? "people",
  },

  auth: {
    jwksUrl: process.env["JWKS_URL"] ?? "https://auth.acdgbrasil.com.br/oauth/v2/keys",
    issuer: process.env["ZITADEL_ISSUER"] ?? "https://auth.acdgbrasil.com.br",
    introspectUrl: process.env["ZITADEL_INTROSPECT_URL"],
    introspectClientId: process.env["ZITADEL_INTROSPECT_CLIENT_ID"],
    introspectClientSecret: process.env["ZITADEL_INTROSPECT_CLIENT_SECRET"],
    allowedServiceAccounts: process.env["ALLOWED_SERVICE_ACCOUNTS"]
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? [],
  },

  nats: {
    url: process.env["NATS_URL"],
  },
} as const;
