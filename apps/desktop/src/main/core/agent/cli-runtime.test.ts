import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CodexSymlinkUnavailableError,
  cmdShimInvocation,
  pathEnvKey,
  prepareCodexRuntime,
  quoteCmdArg,
  scrubbedEnvironment,
} from "./cli-runtime";

function errno(code: string) {
  return Object.assign(new Error(code), { code });
}

describe("prepareCodexRuntime credential isolation", () => {
  async function run(platform: NodeJS.Platform, code: string) {
    const directory = await mkdtemp(join(tmpdir(), "pond-codex-test-"));
    try {
      let failure: Error | undefined;
      try {
        await prepareCodexRuntime(directory, "default", undefined, {
          symlink: () => Promise.reject(errno(code)),
          platform,
        });
      } catch (error) {
        if (error instanceof Error) failure = error;
      }
      return { failure, entries: await readdir(join(directory, "codex-home")) };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  it("fails with an actionable error and copies nothing when Windows refuses the symlink", async () => {
    const source = await mkdtemp(join(tmpdir(), "pond-codex-source-"));
    const original = process.env.CODEX_HOME;
    process.env.CODEX_HOME = source;
    try {
      await writeFile(join(source, "auth.json"), "secret");
      const { failure, entries } = await run("win32", "EPERM");
      expect(failure).toBeInstanceOf(CodexSymlinkUnavailableError);
      expect(String(failure)).toMatch(/Developer Mode/);
      expect(entries).toEqual([]);
    } finally {
      if (original === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = original;
      await rm(source, { recursive: true, force: true });
    }
  });

  it("rethrows other symlink failures unchanged", async () => {
    const { failure } = await run("win32", "EACCES");
    expect(failure).toMatchObject({ code: "EACCES" });
    const posix = await run("linux", "EPERM");
    expect(posix.failure).not.toBeInstanceOf(CodexSymlinkUnavailableError);
  });
});

describe("scrubbedEnvironment", () => {
  it("removes provider variables whatever their casing on Windows", () => {
    const env = scrubbedEnvironment(
      {
        anthropic_api_key: "x",
        Openai_Api_Key: "y",
        Codex_Profile: "z",
        Path: "C:/bin",
        Keep: "1",
      },
      "win32",
    );
    expect(env).toEqual({ Path: "C:/bin", Keep: "1" });
  });

  it("is case-sensitive elsewhere", () => {
    const env = scrubbedEnvironment(
      { anthropic_api_key: "x", ANTHROPIC_API_KEY: "y" },
      "linux",
    );
    expect(env).toEqual({ anthropic_api_key: "x" });
  });

  it("replaces case-variant home variables instead of duplicating them", () => {
    const env = scrubbedEnvironment(
      { UserProfile: "C:/Users/a", Codex_Home: "old" },
      "win32",
      "C:/iso",
    );
    expect(
      Object.keys(env).filter((key) => /^userprofile$/i.test(key)),
    ).toEqual(["USERPROFILE"]);
    expect(env.CODEX_HOME).toBe("C:/iso");
    expect(Object.keys(env).filter((key) => /^codex_home$/i.test(key))).toEqual(
      ["CODEX_HOME"],
    );
  });
});

describe("pathEnvKey", () => {
  it("finds the PATH variable whatever its casing", () => {
    expect(pathEnvKey({ Path: "C:/bin", HOME: "x" })).toBe("Path");
    expect(pathEnvKey({ PATH: "/bin" })).toBe("PATH");
  });

  it("defaults to PATH when none is set", () => {
    expect(pathEnvKey({ HOME: "x" })).toBe("PATH");
  });
});

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
    "quotes %j with %i pass(es) like the CLI package",
    (arg, passes, expected) => {
      expect(quoteCmdArg(arg, passes)).toBe(expected);
    },
  );

  it.each([
    "100%",
    "%PATH%",
    "hello!",
    "two\nlines",
    "carriage\rreturn",
    "nul\0",
  ])("rejects %j, which cmd.exe would still interpret", (arg) => {
    expect(() => quoteCmdArg(arg)).toThrow(/cannot pass safely/);
    expect(() => quoteCmdArg(arg)).toThrow(/native executable/);
  });

  it("wraps a plain argument in an escaped pair of quotes", () => {
    expect(quoteCmdArg("--print", 1)).toBe('^"--print^"');
  });
});

describe.skipIf(process.platform !== "win32")("cmd shims on windows", () => {
  it("passes arguments to a .cmd shim verbatim without running them", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pond cli shim-"));
    try {
      const marker = join(directory, "injected");
      await writeFile(
        join(directory, "echo-args.js"),
        "console.log(JSON.stringify(process.argv.slice(2)))",
      );
      await writeFile(
        join(directory, "echo-args.cmd"),
        `@"${process.execPath}" "%~dp0echo-args.js" %*\r\n`,
      );
      const args = [
        "--print",
        '{"type":"object"}',
        `x" & echo pwned > "${marker}" & "`,
        "a|b <c> (d) ^e",
        "backslash\\",
        "with space",
      ];
      const { file, args: cmdArgs } = cmdShimInvocation(
        join(directory, "echo-args.cmd"),
        args,
      );
      const result = spawnSync(file, cmdArgs, {
        encoding: "utf8",
        windowsVerbatimArguments: true,
        windowsHide: true,
      });
      expect(JSON.parse(result.stdout)).toEqual(args);
      expect(existsSync(marker)).toBe(false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
