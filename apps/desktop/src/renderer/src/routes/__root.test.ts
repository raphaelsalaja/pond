import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const rootPath = fileURLToPath(new URL("./__root.tsx", import.meta.url));
const rootShellPath = fileURLToPath(
  new URL("../components/shell/root-shell.tsx", import.meta.url),
);

describe("__root route", () => {
  it("stays a thin wrapper over RootShell", () => {
    const src = readFileSync(rootPath, "utf8");
    expect(src).not.toMatch(/Hello "__root__"/);
    expect(src).toContain("RootShell");
    expect(src).not.toContain("Tray.Library");
  });

  it("mounts app chrome from RootShell", () => {
    const src = readFileSync(rootShellPath, "utf8");
    expect(src).toContain("Tray.Library");
    expect(src).toContain("SettingsModal");
    expect(src).toContain("window.pond.onNavigate");
  });
});
