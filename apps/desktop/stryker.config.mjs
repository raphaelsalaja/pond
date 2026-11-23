export default {
  testRunner: "vitest",
  plugins: ["@stryker-mutator/vitest-runner"],
  /** Only shared code is mutated, so only its tests run; the full desktop suite overruns the initial test run. */
  vitest: { configFile: "vitest.config.ts", dir: "src/shared", related: true },
  mutate: ["src/shared/**/*.ts", "!src/**/*.test.ts", "!src/**/*.d.ts"],
  /** The Vitest config resolves workspace packages relative to this folder, which a copied sandbox would break. */
  inPlace: true,
  dryRunTimeoutMinutes: 15,
  reporters: ["html", "json", "clear-text", "progress"],
  htmlReporter: { fileName: "reports/mutation/index.html" },
  jsonReporter: { fileName: "reports/mutation/report.json" },
  thresholds: { high: 80, low: 60, break: null },
};
