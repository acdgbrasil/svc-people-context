import postgres, { type Sql } from "postgres";
import { env } from "../config/env.ts";

export type { Sql } from "postgres";

export const createDb = (): Sql =>
  postgres({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
    max: 10,
  });

export const migrate = async (sql: Sql): Promise<void> => {
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

  await sql`CREATE INDEX IF NOT EXISTS idx_people_cpf ON people(cpf) WHERE cpf IS NOT NULL`;
  await sql`CREATE INDEX IF NOT EXISTS idx_system_roles_person ON system_roles(person_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_system_roles_query ON system_roles(system, role) WHERE active = true`;
};
