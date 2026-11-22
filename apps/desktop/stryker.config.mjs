/** @type {import("@stryker-mutator/api/core").PartialStrykerOptions} */
export default {
  testRunner: "vitest",
  plugins: ["@stryker-mutator/vitest-runner"],
  vitest: { configFile: "vitest.config.ts", related: true },
  mutate: ["src/shared/**/*.ts", "!src/**/*.test.ts", "!src/**/*.d.ts"],
  /** The Vitest config resolves workspace packages relative to this folder, which a copied sandbox would break. */
  inPlace: true,
  reporters: ["html", "json", "clear-text", "progress"],
  htmlReporter: { fileName: "reports/mutation/index.html" },
  jsonReporter: { fileName: "reports/mutation/report.json" },
  thresholds: { high: 80, low: 60, break: null },
};
