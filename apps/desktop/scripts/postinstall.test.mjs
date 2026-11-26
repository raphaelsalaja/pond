import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runSetup, SETUP_STEPS } from "./postinstall.mjs";

void test("runs the setup orchestrator without shell failure masking", () => {
  const packageJson = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.equal(
    packageJson.scripts.postinstall,
    "node ./scripts/postinstall.mjs",
  );
});

void test("classifies desktop setup steps by runtime requirement", () => {
  assert.deepEqual(
    SETUP_STEPS.map(({ script, required }) => [script, required]),
    [
      ["ensure-electron.mjs", true],
      ["rebuild-native.mjs", true],
      ["prepare-app-icon.mjs", false],
      ["prepare-icon-previews.mjs", false],
      ["prepare-dock-icons.mjs", false],
      ["patch-electron-name.mjs", false],
      ["copy-replay-assets.mjs", true],
      ["fetch-mac-ffmpeg.mjs", false],
      ["build-native-host.mjs", process.platform === "darwin"],
    ],
  );
});

void test("fails installation when the Electron native rebuild fails", () => {
  const nativeRebuild = SETUP_STEPS.find(
    ({ script }) => script === "rebuild-native.mjs",
  );
  assert.ok(nativeRebuild);

  assert.throws(
    () =>
      runSetup({
        steps: [nativeRebuild],
        run: () => {
          throw new Error("rebuild failed");
        },
      }),
    /required setup failed: Electron native module rebuild/,
  );
});

void test("continues after optional cosmetic preparation fails", () => {
  const calls = [];
  const warnings = [];
  const steps = [
    {
      name: "cosmetic preparation",
      script: "cosmetic.mjs",
      required: false,
    },
    {
      name: "required runtime asset",
      script: "required.mjs",
      required: true,
    },
  ];

  runSetup({
    steps,
    run: ({ script }) => {
      calls.push(script);
      if (script === "cosmetic.mjs") {
        throw new Error("cosmetic failure");
      }
    },
    warn: (message) => warnings.push(message),
  });

  assert.deepEqual(calls, ["cosmetic.mjs", "required.mjs"]);
  assert.equal(warnings.length, 1);
});

void test("skips a step when its skip variable is set to 1", () => {
  const calls = [];
  const logs = [];
  const steps = [
    {
      name: "build-time asset",
      script: "asset.mjs",
      required: false,
      skipEnv: "POND_SKIP_ASSET",
    },
    { name: "runtime asset", script: "runtime.mjs", required: true },
  ];
  const run = ({ script }) => calls.push(script);

  runSetup({
    steps,
    run,
    log: (message) => logs.push(message),
    env: { POND_SKIP_ASSET: "1" },
  });
  assert.deepEqual(calls, ["runtime.mjs"]);
  assert.equal(logs.length, 1);

  calls.length = 0;
  runSetup({ steps, run, env: { POND_SKIP_ASSET: "0" } });
  assert.deepEqual(calls, ["asset.mjs", "runtime.mjs"]);
});
