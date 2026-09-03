import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * The Supabase RLS/constraint integration suite (issue #22) — needs a real
 * local Postgres + GoTrue stack (`supabase start`), so it's excluded from the
 * default `npm test` run and only wired into CI's `db` job.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
