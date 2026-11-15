import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // Tests sans base de données ni réseau : fonctions pures, fetch et DNS simulés.
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
});
