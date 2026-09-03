import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Runs against a real local Postgres/GoTrue stack (see
    // vitest.integration.config.ts) — excluded from the fast default suite.
    exclude: ["tests/integration/**", "node_modules/**"],
  },
});
