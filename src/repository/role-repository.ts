import type { Sql } from "postgres";
import type { SystemRole, AssignRoleInput } from "../domain/index.ts";

type PersonSummary = {
  readonly id: string;
  readonly fullName: string;
  readonly cpf: string | null;
  readonly birthDate: string;
};

type RoleQueryResult = {
  readonly person: PersonSummary;
  readonly role: SystemRole;
};

export type RoleRepository = {
  readonly assign: (personId: string, input: AssignRoleInput) => Promise<{ readonly role: SystemRole; readonly created: boolean }>;
  readonly listByPerson: (personId: string, active?: boolean) => Promise<readonly SystemRole[]>;
  readonly deactivate: (personId: string, roleId: string) => Promise<boolean>;
  readonly reactivate: (personId: string, roleId: string) => Promise<boolean>;
  readonly query: (system: string, role?: string, active?: boolean) => Promise<readonly RoleQueryResult[]>;
}

const SELECT_ROLE = `id, person_id AS "personId", system, role, active, assigned_at::text AS "assignedAt"`;

export const createRoleRepository = (sql: Sql): RoleRepository => ({
  assign: async (personId, input) => {
    const [existing] = await sql<SystemRole[]>`
      SELECT ${sql.unsafe(SELECT_ROLE)} FROM system_roles
      WHERE person_id = ${personId} AND system = ${input.system} AND role = ${input.role}
    `;

    if (existing) {
      if (existing.active) return { role: existing, created: false };
      const [reactivated] = await sql<SystemRole[]>`
        UPDATE system_roles SET active = true WHERE id = ${existing.id}
        RETURNING ${sql.unsafe(SELECT_ROLE)}
      `;
      return { role: reactivated!, created: true };
    }

    const [row] = await sql<SystemRole[]>`
      INSERT INTO system_roles (person_id, system, role)
      VALUES (${personId}, ${input.system}, ${input.role})
      RETURNING ${sql.unsafe(SELECT_ROLE)}
    `;
    return { role: row!, created: true };
  },

  listByPerson: async (personId, active) => {
    if (active !== undefined) {
      return sql<SystemRole[]>`
        SELECT ${sql.unsafe(SELECT_ROLE)} FROM system_roles
        WHERE person_id = ${personId} AND active = ${active}
        ORDER BY assigned_at
      `;
    }
    return sql<SystemRole[]>`
      SELECT ${sql.unsafe(SELECT_ROLE)} FROM system_roles
      WHERE person_id = ${personId}
      ORDER BY assigned_at
    `;
  },

  deactivate: async (personId, roleId) => {
    const [row] = await sql`
      UPDATE system_roles SET active = false
      WHERE id = ${roleId} AND person_id = ${personId} AND active = true
      RETURNING id
    `;
    return !!row;
  },

  reactivate: async (personId, roleId) => {
    const [row] = await sql`
      UPDATE system_roles SET active = true
      WHERE id = ${roleId} AND person_id = ${personId} AND active = false
      RETURNING id
    `;
    return !!row;
  },

  query: async (system, role, active = true) => {
    const rows = await sql<Array<{
      personId: string; fullName: string; cpf: string | null; birthDate: string;
      roleId: string; system: string; role: string; active: boolean; assignedAt: string;
    }>>`
      SELECT
        p.id AS "personId", p.full_name AS "fullName", p.cpf, p.birth_date::text AS "birthDate",
        sr.id AS "roleId", sr.system, sr.role, sr.active, sr.assigned_at::text AS "assignedAt"
      FROM system_roles sr
      JOIN people p ON p.id = sr.person_id
      WHERE sr.system = ${system} AND sr.active = ${active}
      ${role ? sql`AND sr.role = ${role}` : sql``}
      ORDER BY p.full_name
    `;

    return rows.map((r) => ({
      person: { id: r.personId, fullName: r.fullName, cpf: r.cpf, birthDate: r.birthDate },
      role: { id: r.roleId, personId: r.personId, system: r.system, role: r.role, active: r.active, assignedAt: r.assignedAt },
    }));
  },
});
