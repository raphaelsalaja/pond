import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { checkCliConnection } from "./cli-runtime";
import { completeWithTools } from "./complete";

const inheritedProviderEnv = [
  "OPENAI_API_KEY",
  "CODEX_API_KEY",
  "CODEX_ACCESS_TOKEN",
  "CODEX_APP_TOOLS_PIPE_PATH",
  "CODEX_CONNECTORS_TOKEN",
  "CODEX_ESCALATE_SOCKET",
  "CODEX_EXEC_SERVER_NOISE_AUTH_TOKEN",
  "CODEX_GUARDIAN_DECISIONS_API_KEY",
  "CODEX_MCP_NODE_PATH",
  "OPENAI_BASE_URL",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_AWS_API_KEY",
  "ANTHROPIC_AWS_BASE_URL",
  "ANTHROPIC_AWS_WORKSPACE_ID",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_BEDROCK_BASE_URL",
  "ANTHROPIC_BEDROCK_MANTLE_BASE_URL",
  "ANTHROPIC_BEDROCK_REGION_PREFIX",
  "ANTHROPIC_BEDROCK_SERVICE_TIER",
  "ANTHROPIC_CUSTOM_HEADERS",
  "ANTHROPIC_FEDERATION_RULE_ID",
  "ANTHROPIC_FOUNDRY_API_KEY",
  "ANTHROPIC_FOUNDRY_AUTH_TOKEN",
  "ANTHROPIC_FOUNDRY_BASE_URL",
  "ANTHROPIC_FOUNDRY_RESOURCE",
  "ANTHROPIC_ORGANIZATION_ID",
  "ANTHROPIC_PROFILE",
  "ANTHROPIC_VERTEX_BASE_URL",
  "ANTHROPIC_VERTEX_PROJECT_ID",
  "ANTHROPIC_WORKSPACE_ID",
  "AWS_BEARER_TOKEN_BEDROCK",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST",
  "CLAUDE_CODE_SKIP_ANTHROPIC_AWS_AUTH",
  "CLAUDE_CODE_SKIP_BEDROCK_AUTH",
  "CLAUDE_CODE_SKIP_FOUNDRY_AUTH",
  "CLAUDE_CODE_SKIP_MANTLE_AUTH",
  "CLAUDE_CODE_SKIP_VERTEX_AUTH",
  "CLAUDE_CODE_USE_ANTHROPIC_AWS",
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_FOUNDRY",
  "CLAUDE_CODE_USE_MANTLE",
  "CLAUDE_CODE_USE_VERTEX",
  "CLAUDECODE",
] as const;

const codexDisabledFeatures = [
  "apps",
  "artifact",
  "auth_elicitation",
  "browser_use",
  "browser_use_external",
  "browser_use_full_cdp_access",
  "code_mode",
  "code_mode_host",
  "code_mode_only",
  "computer_use",
  "current_time_reminder",
  "deferred_executor",
  "enable_mcp_apps",
  "executor_capability_discovery",
  "goals",
  "hooks",
  "image_generation",
  "in_app_browser",
  "multi_agent",
  "multi_agent_v2",
  "plugin_sharing",
  "plugins",
  "recommended_plugins",
  "remote_plugin",
  "request_permissions_tool",
  "send_message_to_user_async",
  "shell_tool",
  "skill_mcp_dependency_install",
  "skill_search",
  "sleep_tool",
  "standalone_web_search",
  "token_budget",
  "tool_call_mcp_elicitation",
  "tool_suggest",
  "unified_exec",
  "view_image",
  "web_search_cached",
  "web_search_request",
  "workspace_dependencies",
] as const;

// Exercise the real process boundary and Pond tool loop without spending a plan's usage.
const fixture = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const codex = /[\\\\/]codex(\\.js)?$/.test(process.argv[1]);
const forbiddenEnv = ${JSON.stringify(inheritedProviderEnv)};
const codexDisabledFeatures = ${JSON.stringify(codexDisabledFeatures)};
const productionArgs = ['--print', '--output-format', '--json-schema', '--no-session-persistence', '--safe-mode', '--restricted', '--tools', '', '--strict-mcp-config', '--permission-mode', 'dontAsk', '--system-prompt'];
const hasPair = (first, second) => args.some((arg, index) => arg === first && args[index + 1] === second);
let stdin = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => stdin += chunk);
process.stdin.on('end', () => {
  if (forbiddenEnv.some(name => process.env[name]))
    throw new Error('API credentials must not reach subscription processes');
  if (args.includes('login')) {
    const store = args.find(arg => arg.startsWith('cli_auth_credentials_store='))?.split('=', 2)[1]?.replaceAll('"', '');
    if (process.env.POND_CLI_AUTH === 'api') console.log('Logged in using an API key');
    else if (process.env.POND_CLI_AUTH_STORE && store !== process.env.POND_CLI_AUTH_STORE) console.log('Not logged in');
    else console.log('Logged in using ChatGPT');
    return;
  }
  if (args[0] === 'auth') {
    console.log(JSON.stringify({loggedIn: true, authMethod: process.env.POND_CLI_AUTH === 'api' ? 'api_key' : 'claude.ai'})); return;
  }
  if (codex && args[0] === 'debug' && args[1] === 'models') {
    const catalogConfig = args.find(arg => arg.startsWith('model_catalog_json='));
    if (catalogConfig) {
      if (process.env.POND_CLI_UNSAFE_CATALOG) {
        console.log(JSON.stringify({models: [{slug: 'fixture-model', shell_type: 'unified_exec', apply_patch_tool_type: 'freeform', experimental_supported_tools: ['clock'], supports_search_tool: true, node_repl_disabled: false}]})); return;
      }
      const catalogPath = JSON.parse(catalogConfig.slice('model_catalog_json='.length));
      console.log(fs.readFileSync(catalogPath, 'utf8')); return;
    }
    if (process.env.POND_CLI_CATALOG_FAIL_ONCE && !fs.existsSync(process.env.POND_CLI_CATALOG_FAIL_ONCE)) {
      fs.writeFileSync(process.env.POND_CLI_CATALOG_FAIL_ONCE, 'failed'); process.exit(1);
    }
    console.log(JSON.stringify({models: [{slug: 'fixture-model', display_name: 'Fixture model', priority: 1, shell_type: 'unified_exec', apply_patch_tool_type: 'freeform', experimental_supported_tools: ['clock'], supports_search_tool: true}]})); return;
  }
  if (codex && args[0] === 'debug' && args[1] === 'prompt-input') {
    if (!/[\\\\/]codex-home$/.test(process.env.CODEX_HOME ?? ''))
      throw new Error('Codex prompt probe did not use an isolated home');
    if (process.env.POND_CLI_LEAK_SKILL) {
      const tick = String.fromCharCode(96);
      console.log(JSON.stringify([{role: 'developer', content: '<skills_instructions>\\n### Skill roots\\n- ' + tick + 'r0' + tick + ' = ' + tick + '/Users/example/.agents/skills' + tick + '\\n</skills_instructions>'}])); return;
    }
    console.log(JSON.stringify([{role: 'user', content: 'Pond isolation compatibility check.'}])); return;
  }
  if (!codex && !productionArgs.every(arg => args.includes(arg)))
    throw new Error('Claude production flags missing');
  if (!codex && args.includes('--version')) {
    console.log(process.env.POND_CLI_LEGACY_CLAUDE ? '2.1.247' : '2.1.248'); return;
  }
  if (codex) {
    const config = new Map();
    for (let index = 0; index < args.length - 1; index++)
      if (args[index] === '-c') {
        const [key, value] = args[index + 1].split('=', 2);
        config.set(key, value);
      }
    const requiredArgs = ['--ephemeral', '--ignore-user-config', '--ignore-rules', '--strict-config'];
    if (!requiredArgs.every(arg => args.includes(arg)) || !hasPair('--sandbox', 'read-only'))
      throw new Error('Codex isolation flags missing');
    if (codexDisabledFeatures.some(feature => config.get('features.' + feature) !== 'false'))
      throw new Error('Codex native capability remains enabled');
    const requiredConfig = new Map([
      ['approval_policy', '"never"'],
      ['forced_login_method', '"chatgpt"'],
      ['allow_login_shell', 'false'],
      ['agents.enabled', 'false'],
      ['cloud.skills.enabled', 'false'],
      ['orchestrator.mcp.enabled', 'false'],
      ['orchestrator.skills.enabled', 'false'],
      ['tools.experimental_request_user_input.enabled', 'false'],
      ['tools.update_plan.enabled', 'false'],
      ['web_search', '"disabled"'],
      ['features.skip_host_skill_discovery', 'true'],
    ]);
    if ([...requiredConfig].some(([key, value]) => config.get(key) !== value))
      throw new Error('Codex strict isolation config missing');
    const catalogPath = JSON.parse(config.get('model_catalog_json') ?? 'null');
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    if (catalog.models.some(model =>
      model.shell_type !== 'disabled' ||
      model.apply_patch_tool_type !== null ||
      model.experimental_supported_tools.length !== 0 ||
      model.supports_search_tool !== false ||
      model.include_skills_usage_instructions !== false ||
      model.tool_mode !== null
    )) throw new Error('Codex model catalog exposes a native capability');
    if (!/[\\\\/]codex-home$/.test(process.env.CODEX_HOME ?? ''))
      throw new Error('Codex production request did not use an isolated home');
    const credentialStore = JSON.parse(config.get('cli_auth_credentials_store') ?? 'null');
    if (credentialStore !== 'file')
      throw new Error('Codex production request did not select file-backed credentials');
    const auth = process.env.CODEX_HOME + '/auth.json';
    // Credentials are linked, never copied.
    if (!fs.lstatSync(auth).isSymbolicLink() && (process.platform !== 'win32' || fs.readFileSync(auth, 'utf8') !== 'fixture-auth'))
      throw new Error('Codex authentication was copied instead of linked');
    if (!stdin && args.includes('--output-schema')) {
      if (process.env.POND_CLI_LEGACY_CODEX)
        console.error('Error loading config.toml: unknown configuration field');
      else console.error('Failed to read output schema file');
      process.exit(1);
    }
  }
  if (stdin.includes('hang-fixture')) {
    fs.writeFileSync(process.env.POND_CLI_PID, String(process.pid));
    setInterval(() => {}, 1000); return;
  }
  if (stdin.includes('fail-fixture')) process.exit(7);
  if (stdin.includes('malformed-fixture')) { console.log('not JSON'); return; }
  const request = JSON.parse(stdin);
  const hasResult = request.prompt.some(message => message.role === 'tool');
  const reply = hasResult
    ? {text: 'Found a saved article.', toolCalls: []}
    : {text: '', toolCalls: [{name: 'searchLibrary', arguments: '{"query":"design"}'}]};
  if (codex) {
    console.log(JSON.stringify({type: 'item.completed', item: {type: 'agent_message', text: JSON.stringify(reply)}}));
    console.log(JSON.stringify({type: 'turn.completed', usage: {input_tokens: 10, output_tokens: 10}}));
  } else console.log(JSON.stringify({type: 'result', is_error: false, structured_output: reply}));
});
`;

/** Codex credentials are linked, never copied, so Windows without Developer Mode cannot run these. */
const canLinkCredentials = (() => {
  const probe = mkdtempSync(join(tmpdir(), "pond-symlink-probe-"));
  try {
    symlinkSync(join(probe, "target"), join(probe, "link"));
    return true;
  } catch {
    return false;
  } finally {
    rmSync(probe, { recursive: true, force: true });
  }
})();
const itWithCodex = it.skipIf(!canLinkCredentials);

let directory = "";
const originalPath = process.env.PATH;
const originalCodexHome = process.env.CODEX_HOME;
const originalKeys = Object.fromEntries(
  inheritedProviderEnv.map((name) => [name, process.env[name]]),
);

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "pond-cli-assistant-"));
  for (const name of ["codex", "claude"]) {
    if (process.platform === "win32") {
      // Windows cannot execute a shebang file; npm installs CLIs as .cmd shims.
      await writeFile(join(directory, `${name}.js`), fixture);
      await writeFile(
        join(directory, `${name}.cmd`),
        `@"${process.execPath}" "%~dp0${name}.js" %*\r\n`,
      );
    } else await writeFile(join(directory, name), fixture, { mode: 0o755 });
  }
  process.env.PATH = `${directory}${delimiter}${originalPath}`;
  process.env.CODEX_HOME = join(directory, "source-codex-home");
  await mkdir(process.env.CODEX_HOME, { recursive: true });
  await writeFile(join(process.env.CODEX_HOME, "auth.json"), "fixture-auth", {
    mode: 0o600,
  });
  process.env.POND_CLI_PID = join(directory, "child.pid");
  for (const name of Object.keys(originalKeys))
    process.env[name] = "must-not-reach-subscription-child";
});

afterAll(async () => {
  process.env.PATH = originalPath;
  if (originalCodexHome === undefined) delete process.env.CODEX_HOME;
  else process.env.CODEX_HOME = originalCodexHome;
  delete process.env.POND_CLI_PID;
  delete process.env.POND_CLI_AUTH;
  delete process.env.POND_CLI_AUTH_STORE;
  delete process.env.POND_CLI_CATALOG_FAIL_ONCE;
  delete process.env.POND_CLI_LEGACY_CLAUDE;
  delete process.env.POND_CLI_LEGACY_CODEX;
  delete process.env.POND_CLI_LEAK_SKILL;
  delete process.env.POND_CLI_UNSAFE_CATALOG;
  for (const [name, value] of Object.entries(originalKeys)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  await rm(directory, { recursive: true, force: true });
});

function run(
  provider: "codex" | "claude-code",
  content = "Find design",
  controller = new AbortController(),
) {
  const calls: string[] = [];
  let text = "";
  const result = completeWithTools({
    provider,
    model: "default",
    apiKey: null,
    messages: [{ role: "user", content }],
    context: "",
    tools: [
      {
        name: "searchLibrary",
        description: "Find saved articles.",
        schema: z.object({ query: z.string() }),
        execute: async (args) => {
          calls.push(z.string().parse(args.query));
          return { title: "A saved design article" };
        },
      },
    ],
    abortController: controller,
    onText: (delta) => {
      text += delta;
    },
    waitForTextChunk: async () => {},
  });
  return { result, calls, text: () => text };
}

describe("subscription assistant through real CLI processes", () => {
  it.each(["codex", "claude-code"] as const)(
    "rejects a saved API-key login for %s",
    async (provider) => {
      process.env.POND_CLI_AUTH = "api";
      try {
        const reply = run(provider);
        await expect(reply.result).rejects.toThrow(/sign in/i);
        expect(reply.calls).toEqual([]);
      } finally {
        delete process.env.POND_CLI_AUTH;
      }
    },
  );

  it("asks for a Claude Code update when isolation flags are unavailable", async () => {
    process.env.POND_CLI_LEGACY_CLAUDE = "1";
    try {
      await expect(checkCliConnection("claude-code")).resolves.toEqual({
        ok: false,
        error: "Update Claude Code to v2.1.248 or later, then connect again.",
      });
    } finally {
      delete process.env.POND_CLI_LEGACY_CLAUDE;
    }
  });

  it.skipIf(canLinkCredentials)(
    "gates Codex with an actionable error when symlinks are refused",
    async () => {
      const result = await checkCliConnection("codex");
      expect(result).toMatchObject({
        ok: false,
        error: expect.stringMatching(/Developer Mode/),
      });
    },
  );

  itWithCodex("retries a transient Codex model catalog failure", async () => {
    const marker = join(directory, "catalog-failed-once");
    process.env.POND_CLI_CATALOG_FAIL_ONCE = marker;
    try {
      await expect(checkCliConnection("codex")).resolves.toEqual({
        ok: false,
        error: "Codex model catalog is unavailable.",
      });
      await expect(checkCliConnection("codex")).resolves.toEqual({ ok: true });
    } finally {
      delete process.env.POND_CLI_CATALOG_FAIL_ONCE;
    }
  });

  itWithCodex(
    "asks for a Codex update when strict isolation config is unavailable",
    async () => {
      process.env.POND_CLI_LEGACY_CODEX = "1";
      try {
        await expect(checkCliConnection("codex")).resolves.toEqual({
          ok: false,
          error:
            "This Codex version cannot provide Pond's isolated runtime. Update Codex and try again.",
        });
      } finally {
        delete process.env.POND_CLI_LEGACY_CODEX;
      }
    },
  );
  itWithCodex.each(["POND_CLI_LEAK_SKILL", "POND_CLI_UNSAFE_CATALOG"] as const)(
    "rejects Codex when the isolation probe detects %s",
    async (name) => {
      process.env[name] = "1";
      try {
        await expect(checkCliConnection("codex")).resolves.toEqual({
          ok: false,
          error:
            "This Codex version cannot provide Pond's isolated runtime. Update Codex and try again.",
        });
      } finally {
        delete process.env[name];
      }
    },
  );
  it.each(
    canLinkCredentials
      ? (["codex", "claude-code"] as const)
      : (["claude-code"] as const),
  )("runs Pond tools and returns a reply with %s", async (provider) => {
    const reply = run(provider);
    await expect(reply.result).resolves.toBe("Found a saved article.");
    expect(reply.calls).toEqual(["design"]);
    expect(reply.text()).toBe("Found a saved article.");
  });

  it("rejects keyring-backed Codex before reporting a connection", async () => {
    process.env.POND_CLI_AUTH_STORE = "keyring";
    try {
      const reply = run("codex");
      await expect(reply.result).rejects.toThrow(/file-backed Codex/i);
      expect(reply.calls).toEqual([]);
      expect(reply.text()).toBe("");
    } finally {
      delete process.env.POND_CLI_AUTH_STORE;
    }
  });

  itWithCodex.each(["fail-fixture", "malformed-fixture"])(
    "reports %s without inventing a reply",
    async (content) => {
      const reply = run("codex", content);
      await expect(reply.result).rejects.toThrow(
        content === "fail-fixture" ? /exited/ : /invalid/i,
      );
      expect(reply.calls).toEqual([]);
      expect(reply.text()).toBe("");
    },
  );

  itWithCodex(
    "stops the actual CLI process when a reply is cancelled",
    async () => {
      const controller = new AbortController();
      const reply = run("codex", "hang-fixture", controller);
      const rejected = expect(reply.result).rejects.toThrow();
      let pid = 0;
      for (let attempt = 0; attempt < 100; attempt++) {
        const stored = await readFile(
          join(directory, "child.pid"),
          "utf8",
        ).catch(() => "");
        if (stored) {
          pid = Number(stored);
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      controller.abort();
      await rejected;
      expect(pid).toBeGreaterThan(0);
      await expect
        .poll(() => {
          try {
            process.kill(pid, 0);
            return false;
          } catch {
            return true;
          }
        })
        .toBe(true);
      expect(reply.text()).toBe("");
    },
  );
});
