import type { Sql } from "postgres";
import type { Person, CreatePersonInput, UpdatePersonInput } from "../domain/index.ts";

type ListOptions = {
  readonly search?: string;
  readonly cursor?: string;
  readonly limit?: number;
};

type ListResult = {
  readonly data: readonly Person[];
  readonly totalCount: number;
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
};

export type PersonRepository = {
  readonly create: (input: CreatePersonInput) => Promise<Person>;
  readonly findById: (id: string) => Promise<Person | null>;
  readonly findByCpf: (cpf: string) => Promise<Person | null>;
  readonly update: (id: string, input: UpdatePersonInput) => Promise<Person | null>;
  readonly list: (options?: ListOptions) => Promise<ListResult>;
}

const SELECT_FIELDS = `
  id, full_name AS "fullName", cpf, birth_date::text AS "birthDate",
  created_at::text AS "createdAt", updated_at::text AS "updatedAt"
`;

export const createPersonRepository = (sql: Sql): PersonRepository => ({
  create: async (input) => {
    const [row] = await sql<Person[]>`
      INSERT INTO people (full_name, cpf, birth_date)
      VALUES (${input.fullName}, ${input.cpf ?? null}, ${input.birthDate})
      RETURNING ${sql.unsafe(SELECT_FIELDS)}
    `;
    return row!;
  },

  findById: async (id) => {
    const [row] = await sql<Person[]>`
      SELECT ${sql.unsafe(SELECT_FIELDS)} FROM people WHERE id = ${id}
    `;
    return row ?? null;
  },

  findByCpf: async (cpf) => {
    const [row] = await sql<Person[]>`
      SELECT ${sql.unsafe(SELECT_FIELDS)} FROM people WHERE cpf = ${cpf}
    `;
    return row ?? null;
  },

  update: async (id, input) => {
    const [row] = await sql<Person[]>`
      UPDATE people
      SET full_name = ${input.fullName},
          cpf = ${input.cpf ?? null},
          birth_date = ${input.birthDate},
          updated_at = now()
      WHERE id = ${id}
      RETURNING ${sql.unsafe(SELECT_FIELDS)}
    `;
    return row ?? null;
  },

  list: async (options = {}) => {
    const limit = Math.min(options.limit ?? 20, 100);
    const search = options.search?.trim();
    const hasSearch = !!search;
    const hasCursor = !!options.cursor;

    const [countRow] = await sql<[{ count: string }]>`
      SELECT count(*)::text AS count FROM people
      ${hasSearch ? sql`WHERE (full_name ILIKE ${"%" + search + "%"} OR cpf LIKE ${search + "%"})` : sql``}
    `;
    const totalCount = Number(countRow!.count);

    const rows = await sql<Person[]>`
      SELECT ${sql.unsafe(SELECT_FIELDS)} FROM people
      WHERE true
      ${hasSearch ? sql`AND (full_name ILIKE ${"%" + search + "%"} OR cpf LIKE ${search + "%"})` : sql``}
      ${hasCursor ? sql`AND id > ${options.cursor!}` : sql``}
      ORDER BY id
      LIMIT ${limit + 1}
    `;

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && data.length > 0 ? data[data.length - 1]!.id : null;

    return { data, totalCount, hasMore, nextCursor };
  },
});
