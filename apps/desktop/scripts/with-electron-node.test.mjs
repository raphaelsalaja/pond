import assert from "node:assert/strict";
import test from "node:test";
import { electronNodeInvocation } from "./with-electron-node.mjs";

test("runs the script as Node inside Electron", () => {
  const invocation = electronNodeInvocation(
    "electron.exe",
    ["./node_modules/drizzle-kit/bin.cjs", "generate"],
    { PATH: "p" },
  );
  assert.deepEqual(invocation, {
    command: "electron.exe",
    args: ["./node_modules/drizzle-kit/bin.cjs", "generate"],
    env: { PATH: "p", ELECTRON_RUN_AS_NODE: "1" },
  });
});
