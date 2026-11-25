import { spawnSync } from "node:child_process";

const files = [
  "src/shared/file-format.test.ts",
  "src/shared/text-encoding.test.ts",
  "src/main/core/conversion-capabilities.test.ts",
  "src/main/core/gif-thumbnail.test.ts",
  "src/renderer/src/features/saves/lib/media/viewer-capability.test.ts",
  "src/renderer/src/features/saves/components/viewers/safe-web-viewer/mhtml.test.ts",
  "src/main/core/image-compression.test.ts",
  "src/main/core/media-metadata.test.ts",
  "src/main/core/image-metadata.test.ts",
  "src/main/core/pipeline/queue-v2.simulation.test.ts",
  "src/main/core/pipeline/retry-policy.test.ts",
  "src/main/core/pipeline/worker-host.test.ts",
  "src/main/database/migrations.test.ts",
  "src/main/core/storage",
];

const result = spawnSync("pnpm", ["exec", "vitest", "run", ...files], {
  cwd: new URL("..", import.meta.url),
  env: {
    ...process.env,
    POND_OFFLINE: "1",
    HTTP_PROXY: "http://127.0.0.1:9",
    HTTPS_PROXY: "http://127.0.0.1:9",
    NO_PROXY: "",
  },
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
