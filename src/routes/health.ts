import { Elysia } from "elysia";
import type { Sql } from "postgres";

export const createHealthRoutes = (sql: Sql) =>
  new Elysia()
    .get("/health", () => ({ status: "alive" }))
    .get("/ready", async ({ set }) => {
      try {
        await sql`SELECT 1`;
        return { status: "ready" };
      } catch {
        set.status = 503;
        return { status: "unavailable" };
      }
    });
