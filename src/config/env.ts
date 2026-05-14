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
    projectId: process.env["ZITADEL_PROJECT_ID"] ?? "",
  },

  nats: {
    url: process.env["NATS_URL"],
  },

  // IdP: Authentik (ADR-027).
  // AppSec HIGH-10: validacao consistente — ambos OU nenhum.
  authentik: {
    baseUrl: process.env["AUTHENTIK_URL"],
    token: process.env["AUTHENTIK_TOKEN"],
  },
} as const;

// AppSec HIGH-10: validacao de coerencia das envs do IdP no boot.
// Falha cedo (fail-fast) se config for parcial — evita degradacao silenciosa
// onde createUser silenciosamente nao chama Authentik por causa de noop client.
const { baseUrl: authentikUrl, token: authentikToken } = env.authentik;
const authentikConfigured = authentikUrl !== undefined && authentikToken !== undefined;
const authentikPartial = !authentikConfigured && (authentikUrl !== undefined || authentikToken !== undefined);

if (authentikPartial) {
  const missing = authentikUrl === undefined ? "AUTHENTIK_URL" : "AUTHENTIK_TOKEN";
  throw new Error(
    `[env] Authentik config invalida — ${missing} ausente. ` +
      `Defina AMBOS AUTHENTIK_URL e AUTHENTIK_TOKEN, ou NENHUM (para modo noop em dev).`,
  );
}

if (isProduction && !authentikConfigured) {
  throw new Error("[env] AUTHENTIK_URL + AUTHENTIK_TOKEN sao obrigatorios em producao.");
}
