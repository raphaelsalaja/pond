import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: ["src/**/*.browser.test.{ts,tsx}"],
        },
      },
      {
        test: {
          name: "browser",
          include: ["src/**/*.browser.test.{ts,tsx}"],
          setupFiles: ["./test/setup.ts"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
            viewport: { width: 800, height: 600 },
          },
        },
      },
    ],
  },
});
