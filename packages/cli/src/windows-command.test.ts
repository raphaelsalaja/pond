import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  quoteCmdArg,
  resolveWindowsCommand,
  windowsInvocation,
} from "./windows-command";

/** Keep identical to the table in packages/cli/src/windows-command.test.ts and apps/desktop/src/main/core/agent/cli-runtime.test.ts. */
const QUOTE_FIXTURES: Array<[string, number, string]> = [
  ["--print", 1, '^"--print^"'],
  ["with space", 2, '^^^"with^^^ space^^^"'],
  ["a & b", 1, '^"a^ ^&^ b^"'],
  ['{"k":"v"}', 1, String.raw`^"{\^"k\^":\^"v\^"}^"`],
  ["trailing\\", 1, String.raw`^"trailing\\^"`],
];

describe("quoteCmdArg", () => {
  it.each(QUOTE_FIXTURES)(
    "quotes %j with %i pass(es) like the desktop app",
    (arg, passes, expected) => {
      expect(quoteCmdArg(arg, passes)).toBe(expected);
    },
  );

  it("quotes the Cursor JSON argument and escapes shell metacharacters", () => {
    expect(quoteCmdArg('{"name":"pond"}', 1)).toBe(
      '^"{\\^"name\\^":\\^"pond\\^"}^"',
    );
    expect(quoteCmdArg("a & b", 1)).toBe('^"a^ ^&^ b^"');
  });

  it("rejects characters cmd.exe would still expand", () => {
    for (const arg of ["100%", "hi!", "a\nb", "a\0b"])
      expect(() => quoteCmdArg(arg)).toThrow();
  });
});

describe("resolveWindowsCommand", () => {
  it("honours PATHEXT order and a case-insensitive Path key", () => {
    const dir = mkdtempSync(join(tmpdir(), "pond-cli-"));
    try {
      writeFileSync(join(dir, "cursor.CMD"), "");
      expect(
        resolveWindowsCommand("cursor", { Path: dir, PATHEXT: ".EXE;.CMD" }),
      ).toBe(join(dir, "cursor.CMD"));
      expect(resolveWindowsCommand("missing", { Path: dir })).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("windowsInvocation", () => {
  it("runs native executables directly", () => {
    expect(windowsInvocation("C:\\bin\\claude.exe", ["mcp"])).toEqual({
      file: "C:\\bin\\claude.exe",
      args: ["mcp"],
      verbatim: false,
    });
  });

  it("wraps .cmd shims in cmd.exe with a single quoted command line", () => {
    const run = windowsInvocation("C:\\npm\\codex.cmd", ["mcp", "add"], {
      ComSpec: "cmd.exe",
    });
    expect(run.file).toBe("cmd.exe");
    expect(run.verbatim).toBe(true);
    expect(run.args.slice(0, 3)).toEqual(["/d", "/s", "/c"]);
    expect(run.args[3]).toMatch(/^".*codex\.cmd.*mcp.*add.*"$/);
  });
});
