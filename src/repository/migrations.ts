import type { Sql } from "postgres";

// ─── Migration registry (ordered, idempotent) ──────────────────
// Each migration runs inside a transaction. The `schema_migrations`
// table tracks which ones have been applied.

// postgres.js TransactionSql loses the call signature via Omit,
// so we use a minimal callable type for migration functions.
type TaggedSql = (template: TemplateStringsArray, ...params: readonly unknown[]) => Promise<unknown[]>;

type Migration = {
  readonly version: number;
  readonly name: string;
  readonly up: (sql: TaggedSql) => Promise<void>;
};

const migrations: readonly Migration[] = [
  {
    version: 1,
    name: "create_people_table",
    up: async (sql) => {
      await sql`
        CREATE TABLE IF NOT EXISTS people (
          id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          full_name   TEXT NOT NULL CHECK (char_length(full_name) > 0),
          cpf         CHAR(11) UNIQUE,
          birth_date  DATE NOT NULL,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS idx_people_cpf ON people(cpf) WHERE cpf IS NOT NULL`;
    },
  },
  {
    version: 2,
    name: "create_system_roles_table",
    up: async (sql) => {
      await sql`
        CREATE TABLE IF NOT EXISTS system_roles (
          id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          person_id   UUID NOT NULL REFERENCES people(id),
          system      TEXT NOT NULL CHECK (char_length(system) > 0),
          role        TEXT NOT NULL CHECK (char_length(role) > 0),
          active      BOOLEAN NOT NULL DEFAULT true,
          assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (person_id, system, role)
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS idx_system_roles_person ON system_roles(person_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_system_roles_query ON system_roles(system, role) WHERE active = true`;
    },
  },
  {
    version: 3,
    name: "create_outbox_events_table",
    up: async (sql) => {
      await sql`
        CREATE TABLE IF NOT EXISTS outbox_events (
          id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          subject      TEXT NOT NULL,
          payload      JSONB NOT NULL,
          published    BOOLEAN NOT NULL DEFAULT false,
          created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
          published_at TIMESTAMPTZ
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox_events(created_at) WHERE published = false`;
    },
  },
];

// ─── Migration runner ──────────────────────────────────────────

export const migrate = async (sql: Sql): Promise<void> => {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     INTEGER PRIMARY KEY,
      name        TEXT NOT NULL,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  const applied = await sql<Array<{ version: number }>>`
    SELECT version FROM schema_migrations ORDER BY version
  `;
  const appliedVersions = new Set(applied.map((r) => r.version));

  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) continue;

    await sql.begin(async (tx) => {
      await migration.up(tx as unknown as TaggedSql);
      await (tx as unknown as TaggedSql)`
        INSERT INTO schema_migrations (version, name)
        VALUES (${migration.version}, ${migration.name})
      `;
    });

    console.log(`[migrate] Applied migration ${migration.version}: ${migration.name}`);
  }
};
