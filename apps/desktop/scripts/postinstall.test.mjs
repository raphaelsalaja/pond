import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runSetup, SETUP_STEPS } from "./postinstall.mjs";

test("runs the setup orchestrator without shell failure masking", () => {
  const packageJson = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.equal(
    packageJson.scripts.postinstall,
    "node ./scripts/postinstall.mjs",
  );
});

test("classifies desktop setup steps by runtime requirement", () => {
  assert.deepEqual(
    SETUP_STEPS.map(({ script, required }) => [script, required]),
    [
      ["ensure-electron.mjs", true],
      ["rebuild-native.mjs", true],
      ["prepare-app-icon.mjs", false],
      ["prepare-icon-previews.mjs", false],
      ["patch-electron-name.mjs", false],
      ["copy-replay-assets.mjs", true],
      ["build-native-host.mjs", process.platform !== "win32"],
    ],
  );
});

test("fails installation when the Electron native rebuild fails", () => {
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

test("continues after optional cosmetic preparation fails", () => {
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
