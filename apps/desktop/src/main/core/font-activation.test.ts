import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { expect, it } from "vitest";
import {
  activateFont,
  backfillFontActivationIndex,
  deactivateFont,
  pondFontsDir,
} from "./font-activation";

it("installs a font into the Pond fonts directory and removes it", async () => {
  const root = await mkdtemp(join(tmpdir(), "pond-fonts-"));
  const source = join(root, "SourceSerif.ttf");
  await writeFile(source, Buffer.from("font"));
  const fontsDir = join(root, "Fonts");
  const activated = await activateFont({
    sourcePath: source,
    saveId: "save-1",
    platform: "linux",
    fontsDir,
  });
  if (!activated.ok) throw new Error(activated.error);
  expect(activated.path.startsWith(join(fontsDir, "Pond"))).toBe(true);
  expect(await readFile(activated.path, "utf8")).toBe("font");
  const deactivated = await deactivateFont({
    installedPath: activated.path,
    platform: "linux",
    fontsDir,
  });
  expect(deactivated.ok).toBe(true);
  await expect(readFile(activated.path)).rejects.toThrow();
});

it("backfills indexed activation from existing sidecars", () => {
  const db = new Database(":memory:");
  db.exec(
    "CREATE TABLE saves (id TEXT PRIMARY KEY, media_type TEXT, font_activated INTEGER)",
  );
  db.prepare(
    "INSERT INTO saves (id, media_type, font_activated) VALUES (?, ?, ?)",
  ).run("active-font", "font", 0);
  db.prepare(
    "INSERT INTO saves (id, media_type, font_activated) VALUES (?, ?, ?)",
  ).run("inactive-font", "font", 0);
  db.prepare(
    "INSERT INTO saves (id, media_type, font_activated) VALUES (?, ?, ?)",
  ).run("image", "image", 0);

  expect(
    backfillFontActivationIndex(db, (id) =>
      id === "active-font" ? "/fonts/active.ttf" : null,
    ),
  ).toBe(1);
  expect(
    db
      .prepare("SELECT font_activated FROM saves WHERE id = ?")
      .get("active-font"),
  ).toEqual({ font_activated: 1 });
  expect(
    db
      .prepare("SELECT font_activated FROM saves WHERE id = ?")
      .get("inactive-font"),
  ).toEqual({ font_activated: 0 });
  db.close();
});

it("refuses to delete a file outside the Pond fonts directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "pond-fonts-"));
  const outside = join(root, "system.ttf");
  await writeFile(outside, "keep");
  const result = await deactivateFont({
    installedPath: outside,
    platform: "linux",
    fontsDir: join(root, "Fonts"),
  });
  expect(result.ok).toBe(false);
  expect(await readFile(outside, "utf8")).toBe("keep");
});

const FONTS_KEY =
  "HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts";

it("installs per-user Windows fonts in the Fonts root and registers them", async () => {
  const root = await mkdtemp(join(tmpdir(), "pond-fonts-"));
  const source = join(root, "Display.otf");
  await writeFile(source, "font");
  const fontsDir = join(root, "Fonts");
  const registry: string[][] = [];
  const runRegistry = async (args: string[]) => {
    registry.push(args);
  };
  const activated = await activateFont({
    sourcePath: source,
    saveId: "save-1",
    fontsDir,
    platform: "win32",
    runRegistry,
  });
  if (!activated.ok) throw new Error(activated.error);
  expect(activated.path).toBe(join(fontsDir, "save-1.otf"));
  expect(registry).toEqual([
    [
      "add",
      FONTS_KEY,
      "/v",
      "Pond save-1 (OpenType)",
      "/t",
      "REG_SZ",
      "/d",
      activated.path,
      "/f",
    ],
  ]);

  registry.length = 0;
  const deactivated = await deactivateFont({
    installedPath: activated.path.toUpperCase(),
    fontsDir,
    platform: "win32",
    runRegistry,
  });
  expect(deactivated.ok).toBe(true);
  expect(registry[0]?.slice(0, 4)).toEqual([
    "delete",
    FONTS_KEY,
    "/v",
    "Pond SAVE-1 (OpenType)",
  ]);
});

it("removes the copied Windows font when registration fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "pond-fonts-"));
  const source = join(root, "Display.ttf");
  await writeFile(source, "font");
  const fontsDir = join(root, "Fonts");
  const result = await activateFont({
    sourcePath: source,
    saveId: "save-1",
    fontsDir,
    platform: "win32",
    async runRegistry() {
      throw new Error("reg failed");
    },
  });
  expect(result).toEqual({ ok: false, error: "reg failed" });
  await expect(readFile(join(fontsDir, "save-1.ttf"))).rejects.toThrow();
});

it("reports that Windows fonts need a sign-in and macOS fonts do not", async () => {
  const root = await mkdtemp(join(tmpdir(), "pond-fonts-"));
  const source = join(root, "Display.ttf");
  await writeFile(source, "font");
  const win = await activateFont({
    sourcePath: source,
    saveId: "save-1",
    fontsDir: join(root, "Fonts"),
    platform: "win32",
    async runRegistry() {},
  });
  expect(win).toMatchObject({ ok: true, requiresSignIn: true });
  const mac = await activateFont({
    sourcePath: source,
    saveId: "save-1",
    fontsDir: join(root, "MacFonts"),
    platform: "darwin",
  });
  expect(mac.ok && "requiresSignIn" in mac).toBe(false);
});

it("keeps the Windows registration when the font file cannot be removed", async () => {
  const root = await mkdtemp(join(tmpdir(), "pond-fonts-"));
  const fontsDir = join(root, "Fonts");
  // A non-empty directory stands in for a file another app holds open.
  const held = join(fontsDir, "save-1.ttf");
  await mkdir(held, { recursive: true });
  await writeFile(join(held, "child"), "x");
  const registry: string[][] = [];
  const result = await deactivateFont({
    installedPath: held,
    fontsDir,
    platform: "win32",
    async runRegistry(args) {
      registry.push(args);
    },
  });
  expect(result.ok).toBe(false);
  expect(registry).toEqual([]);
});

it("places Windows fonts under LOCALAPPDATA when it is set", () => {
  expect(pondFontsDir("C:\\Users\\a", "win32", "D:\\Local")).toBe(
    join("D:\\Local", "Microsoft", "Windows", "Fonts"),
  );
  expect(pondFontsDir("C:\\Users\\a", "win32", "")).toBe(
    join("C:\\Users\\a", "AppData", "Local", "Microsoft", "Windows", "Fonts"),
  );
});
