import { defineConfig } from "vitest/config";

/** `smoke:packaged` only: it needs a packaged `render/` folder, so `test` never runs it. */
export default defineConfig({
  test: {
    include: ["smoke/**/*.smoke.ts"],
    environment: "node",
  },
});
