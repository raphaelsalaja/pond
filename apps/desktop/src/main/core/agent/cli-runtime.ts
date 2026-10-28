import { spawn } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import which from "which";
import { z } from "zod";
import type { OkResult } from "../../../shared/query-contracts-shared";
import { killProcessTree, trackChildProcess } from "../../lib/process-tree";

export type CliProvider = "codex" | "claude-code";

type CliResult = { stdout: string; stderr: string; code: number | null };

const CODEX_DISABLED_FEATURES = [
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

const CODEX_ISOLATION_CONFIG = [
  'approval_policy="never"',
  'forced_login_method="chatgpt"',
  "allow_login_shell=false",
  "include_apps_instructions=false",
  "include_collaboration_mode_instructions=false",
  "include_environment_context=false",
  "include_permissions_instructions=false",
  "agents.enabled=false",
  "cloud.skills.enabled=false",
  "orchestrator.mcp.enabled=false",
  "orchestrator.skills.enabled=false",
  "tools.experimental_request_user_input.enabled=false",
  "tools.update_plan.enabled=false",
  'web_search="disabled"',
  "features.skip_host_skill_discovery=true",
  ...CODEX_DISABLED_FEATURES.map((feature) => `features.${feature}=false`),
] as const;

const CODEX_ISOLATION_CONFIG_ARGS = CODEX_ISOLATION_CONFIG.flatMap((config) => [
  "-c",
  config,
]);

export const CODEX_ISOLATION_ARGS = [
  "--ephemeral",
  "--ignore-user-config",
  "--ignore-rules",
  "--strict-config",
  "--skip-git-repo-check",
  "--sandbox",
  "read-only",
  "--color",
  "never",
  ...CODEX_ISOLATION_CONFIG_ARGS,
] as const;

const codexCatalogModelSchema = z.object({
  slug: z.string(),
  display_name: z.string().optional(),
  description: z.string().nullish(),
  default_reasoning_level: z.string().nullish(),
  supported_reasoning_levels: z.json().optional(),
  visibility: z.string().optional(),
  supported_in_api: z.boolean().optional(),
  priority: z.number().optional(),
  additional_speed_tiers: z.json().optional(),
  service_tiers: z.json().optional(),
  availability_nux: z.json().optional(),
  upgrade: z.json().optional(),
  default_reasoning_summary: z.string().nullish(),
  support_verbosity: z.boolean().optional(),
  default_verbosity: z.string().nullish(),
  web_search_tool_type: z.string().optional(),
  truncation_policy: z.json().optional(),
  supports_image_detail_original: z.boolean().optional(),
  context_window: z.number().nullish(),
  max_context_window: z.number().nullish(),
  comp_hash: z.string().nullish(),
  effective_context_window_percent: z.number().optional(),
  input_modalities: z.array(z.string()).optional(),
  supports_experimental_context: z.boolean().optional(),
  use_responses_lite: z.boolean().optional(),
  supports_reasoning_effort_updates: z.boolean().optional(),
  shell_type: z.string().optional(),
  model_messages: z.json().optional(),
  include_skills_usage_instructions: z.boolean().optional(),
  include_plugin_usage_instructions: z.boolean().optional(),
  include_apps_usage_instructions: z.boolean().optional(),
  apply_patch_tool_type: z.string().nullish(),
  experimental_supported_tools: z.array(z.string()).optional(),
  supports_search_tool: z.boolean().optional(),
  node_repl_auto_review_required: z.boolean().optional(),
  node_repl_disabled: z.boolean().optional(),
  tool_mode: z.string().nullish(),
  multi_agent_version: z.string().nullish(),
  multi_agent_reasoning_effort: z.string().nullish(),
  base_instructions: z.string().optional(),
});

const codexCatalogSchema = z.object({
  models: z.array(codexCatalogModelSchema).min(1),
});

const CODEX_BASE_INSTRUCTIONS =
  "Follow the supplied developer instructions and return the requested structured response. No native CLI tools are available.";

let bundledCodexCatalog: z.infer<typeof codexCatalogSchema> | undefined;

const CLAUDE_ISOLATION_ARGS = [
  "--no-session-persistence",
  "--safe-mode",
  "--restricted",
  "--tools",
  "",
  "--strict-mcp-config",
  "--permission-mode",
  "dontAsk",
] as const;

export function claudeInvocationArgs(input: {
  schema: string;
  systemPrompt: string;
}): string[] {
  return [
    "--print",
    "--output-format",
    "json",
    "--json-schema",
    input.schema,
    ...CLAUDE_ISOLATION_ARGS,
    "--system-prompt",
    input.systemPrompt,
  ];
}

const INHERITED_PROVIDER_ENV = [
  "OPENAI_API_KEY",
  "CODEX_API_KEY",
  "OPENAI_BASE_URL",
  "CODEX_ACCESS_TOKEN",
  "CODEX_APP_TOOLS_PIPE_PATH",
  "CODEX_CONNECTORS_TOKEN",
  "CODEX_ESCALATE_SOCKET",
  "CODEX_EXEC_SERVER_NOISE_AUTH_TOKEN",
  "CODEX_GUARDIAN_DECISIONS_API_KEY",
  "CODEX_MCP_NODE_PATH",
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

export function isCliProvider(provider: string): provider is CliProvider {
  return provider === "codex" || provider === "claude-code";
}

function commandFor(provider: CliProvider) {
  return provider === "codex" ? "codex" : "claude";
}

function loginHint(provider: CliProvider, platform = process.platform) {
  const terminal = platform === "darwin" ? "Terminal" : "a terminal";
  return provider === "codex"
    ? `Run codex login in ${terminal} and sign in with ChatGPT.`
    : `Run claude auth login in ${terminal} and sign in with your Claude plan.`;
}

/** Windows environment names are case-insensitive and usually spelled `Path`. */
export function pathEnvKey(env: NodeJS.ProcessEnv) {
  return Object.keys(env).find((key) => key.toUpperCase() === "PATH") ?? "PATH";
}

function bunBinDirectory(home: string, env: NodeJS.ProcessEnv) {
  return join(env.BUN_INSTALL || join(home, ".bun"), "bin");
}

function windowsCliDirectories() {
  const home = homedir();
  const { APPDATA, LOCALAPPDATA, NVM_SYMLINK, VOLTA_HOME } = process.env;
  return [
    APPDATA && join(APPDATA, "npm"),
    join(home, ".local/bin"),
    LOCALAPPDATA && join(LOCALAPPDATA, "Programs"),
    NVM_SYMLINK,
    bunBinDirectory(home, process.env),
    VOLTA_HOME && join(VOLTA_HOME, "bin"),
  ].filter((directory): directory is string => Boolean(directory));
}

/** Apps opened from Finder or a desktop launcher skip shell profiles, so their PATH lacks user install folders. */
export function posixCliDirectories(
  home: string,
  env: NodeJS.ProcessEnv,
  nvmVersions: string[],
) {
  const nvm = join(home, ".nvm/versions/node");
  return [
    join(home, ".local/bin"),
    bunBinDirectory(home, env),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    ...nvmVersions
      .toSorted((a, b) => b.localeCompare(a, undefined, { numeric: true }))
      .map((version) => join(nvm, version, "bin")),
  ];
}

const CMD_META_CHARS = /([()\][%!^"`<>&|;, *?])/g;

/**
 * Quotes one argument for cmd.exe. Batch shims re-parse `%*`, so the escaping
 * runs once per parse. Characters cmd.exe would still expand are rejected.
 * Keep in sync with packages/cli/src/windows-command.ts (separately published,
 * so the helper cannot be shared without a new package dependency).
 */
export function quoteCmdArg(arg: string, passes = 2) {
  if (/[\r\n%!]/.test(arg) || arg.includes("\0"))
    throw new Error(
      "A CLI argument contains characters Windows cannot pass safely (%, ! or a line break), usually from a user or temp folder name. Use a folder name without them, or install the CLI as a native executable instead of an npm .cmd shim.",
    );
  const escaped = arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, "$1$1");
  let quoted = `"${escaped}"`;
  for (let pass = 0; pass < passes; pass++)
    quoted = quoted.replace(CMD_META_CHARS, "^$1");
  return quoted;
}

/** Node refuses to spawn .cmd/.bat files directly (CVE-2024-27980), so run them through cmd.exe without a shell. */
export function cmdShimInvocation(executable: string, args: string[]) {
  const commandLine = [
    quoteCmdArg(executable, 1),
    ...args.map((arg) => quoteCmdArg(arg)),
  ];
  return {
    file: process.env.ComSpec ?? "cmd.exe",
    args: ["/d", "/s", "/c", `"${commandLine.join(" ")}"`],
  };
}

/** Removes provider billing variables and applies the isolated Codex home. Windows names are case-insensitive. */
export function scrubbedEnvironment(
  source: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  codexHome?: string,
) {
  const env = { ...source };
  const fold = (name: string) =>
    platform === "win32" ? name.toUpperCase() : name;
  const inherited = new Set<string>(INHERITED_PROVIDER_ENV.map(fold));
  // Subscription connections must never silently use inherited API billing.
  for (const key of Object.keys(env)) {
    const name = fold(key);
    if (
      inherited.has(name) ||
      (name.startsWith("CODEX_") && name !== "CODEX_HOME")
    )
      delete env[key];
  }
  const assign = (name: string, value: string) => {
    for (const key of Object.keys(env)) if (fold(key) === name) delete env[key];
    env[name] = value;
  };
  if (codexHome) {
    assign("CODEX_HOME", codexHome);
    assign("HOME", codexHome);
    assign("USERPROFILE", codexHome);
    assign("XDG_CACHE_HOME", join(codexHome, "cache"));
    assign("XDG_CONFIG_HOME", join(codexHome, "config"));
    assign("XDG_DATA_HOME", join(codexHome, "data"));
  }
  return env;
}

export async function withCliDirectories(path: string): Promise<string> {
  const home = homedir();
  const versions = await readdir(join(home, ".nvm/versions/node")).catch(
    () => [],
  );
  return [
    path,
    ...(process.platform === "win32"
      ? windowsCliDirectories()
      : posixCliDirectories(home, process.env, versions)),
  ].join(delimiter);
}

async function cliEnvironment(codexHome?: string) {
  const env = scrubbedEnvironment(process.env, process.platform, codexHome);
  const pathKey = pathEnvKey(env);
  env[pathKey] = await withCliDirectories(env[pathKey] ?? "");
  return env;
}

export async function runCli(input: {
  provider: CliProvider;
  args: string[];
  cwd: string;
  codexHome?: string;
  stdin?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<CliResult> {
  input.signal?.throwIfAborted();
  const env = await cliEnvironment(input.codexHome);
  const command = commandFor(input.provider);
  const executable = await which(command, { path: env[pathEnvKey(env)] }).catch(
    () => null,
  );
  if (!executable)
    throw new Error(`Install ${command} first. ${loginHint(input.provider)}`);
  input.signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const shim =
      process.platform === "win32" && /\.(cmd|bat)$/i.test(executable)
        ? cmdShimInvocation(executable, input.args)
        : { file: executable, args: input.args };
    const child = spawn(shim.file, shim.args, {
      cwd: input.cwd,
      env,
      shell: false,
      windowsVerbatimArguments: shim.file !== executable,
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
    });
    trackChildProcess(child);
    let stdout = "";
    let stderr = "";
    let bytes = 0;
    let failure: Error | undefined;
    let forceKill: ReturnType<typeof setTimeout> | undefined;
    const kill = (signal: NodeJS.Signals) => {
      if (!child.pid) return;
      try {
        if (process.platform !== "win32") process.kill(-child.pid, signal);
        else killProcessTree(child, signal);
      } catch {
        /* The process group may already have exited. */
      }
    };
    const stop = (error: Error) => {
      failure ??= error;
      kill("SIGTERM");
      forceKill ??= setTimeout(() => kill("SIGKILL"), 2_000);
      forceKill.unref();
    };
    const abort = () => stop(new Error("Reply cancelled."));
    const timer = setTimeout(
      () => stop(new Error(`${command} timed out. Try again.`)),
      input.timeoutMs ?? 5 * 60_000,
    );
    input.signal?.addEventListener("abort", abort, { once: true });
    if (input.signal?.aborted) abort();
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    const collect = (data: string, output: "stdout" | "stderr") => {
      bytes += Buffer.byteLength(data);
      if (bytes > 8 * 1024 * 1024) {
        stop(new Error(`${command} returned too much output.`));
        return;
      }
      if (output === "stdout") stdout += data;
      else stderr += data;
    };
    child.stdout.on("data", (data: string) => collect(data, "stdout"));
    child.stderr.on("data", (data: string) => collect(data, "stderr"));
    child.stdin.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "EPIPE") stop(error);
    });
    child.on("error", (error) => {
      failure = error;
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (forceKill) clearTimeout(forceKill);
      input.signal?.removeEventListener("abort", abort);
      if (failure) reject(failure);
      else resolve({ stdout, stderr, code });
    });
    child.stdin.end(input.stdin ?? "");
  });
}

function isolatedCodexModel(model: z.infer<typeof codexCatalogModelSchema>) {
  return {
    slug: model.slug,
    display_name: model.display_name,
    description: model.description,
    default_reasoning_level: model.default_reasoning_level,
    supported_reasoning_levels: model.supported_reasoning_levels,
    visibility: model.visibility,
    supported_in_api: model.supported_in_api,
    priority: model.priority,
    additional_speed_tiers: model.additional_speed_tiers,
    service_tiers: model.service_tiers,
    availability_nux: model.availability_nux,
    upgrade: model.upgrade,
    default_reasoning_summary: model.default_reasoning_summary,
    support_verbosity: model.support_verbosity,
    default_verbosity: model.default_verbosity,
    web_search_tool_type: model.web_search_tool_type,
    truncation_policy: model.truncation_policy,
    supports_image_detail_original: model.supports_image_detail_original,
    context_window: model.context_window,
    max_context_window: model.max_context_window,
    comp_hash: model.comp_hash,
    effective_context_window_percent: model.effective_context_window_percent,
    input_modalities: model.input_modalities,
    supports_experimental_context: model.supports_experimental_context,
    use_responses_lite: model.use_responses_lite,
    supports_reasoning_effort_updates: model.supports_reasoning_effort_updates,
    shell_type: "disabled",
    model_messages: {
      instructions_template: null,
      instructions_variables: null,
      persistent_instructions: null,
    },
    include_skills_usage_instructions: false,
    include_plugin_usage_instructions: false,
    include_apps_usage_instructions: false,
    apply_patch_tool_type: null,
    experimental_supported_tools: [],
    supports_search_tool: false,
    node_repl_auto_review_required: false,
    node_repl_disabled: true,
    tool_mode: null,
    multi_agent_version: null,
    multi_agent_reasoning_effort: null,
    base_instructions: CODEX_BASE_INSTRUCTIONS,
  };
}

async function loadBundledCodexCatalog(
  directory: string,
  codexHome: string,
  signal?: AbortSignal,
) {
  if (bundledCodexCatalog) return bundledCodexCatalog;
  const result = await runCli({
    provider: "codex",
    args: ["debug", "models", "--bundled"],
    cwd: directory,
    codexHome,
    timeoutMs: 15_000,
    signal,
  });
  if (result.code !== 0) throw new Error("Codex model catalog is unavailable.");
  const parsed = codexCatalogSchema.parse(JSON.parse(result.stdout));
  bundledCodexCatalog ??= parsed;
  return bundledCodexCatalog;
}

/** `claude --model` resolves these aliases to the newest model your plan includes. */
const CLAUDE_CODE_MODELS: CliModel[] = [
  {
    id: "opus",
    name: "Opus",
    description: "The most capable Claude model on your plan.",
  },
  {
    id: "sonnet",
    name: "Sonnet",
    description: "Balanced Claude model for everyday work.",
  },
  {
    id: "haiku",
    name: "Haiku",
    description: "The fastest Claude model on your plan.",
  },
];

export type CliModel = {
  id: string;
  name: string;
  description?: string;
  contextWindow?: number;
};

export async function listCliModels(
  provider: CliProvider,
  signal?: AbortSignal,
): Promise<CliModel[]> {
  if (provider === "claude-code") return CLAUDE_CODE_MODELS;
  const directory = await mkdtemp(join(tmpdir(), "pond-codex-models-"));
  try {
    const codexHome = join(directory, "codex-home");
    await mkdir(codexHome, { recursive: true, mode: 0o700 });
    const catalog = await loadBundledCodexCatalog(directory, codexHome, signal);
    return listedCodexModels(catalog.models);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** Hidden catalog entries are internal review and research models. */
export function listedCodexModels(
  models: z.infer<typeof codexCatalogModelSchema>[],
): CliModel[] {
  return models.flatMap((model) => {
    if (model.visibility !== "list") return [];
    const entry: CliModel = {
      id: model.slug,
      name: model.display_name || model.slug,
    };
    if (model.description) entry.description = model.description;
    if (model.context_window) entry.contextWindow = model.context_window;
    return [entry];
  });
}

export class CodexSymlinkUnavailableError extends Error {
  constructor() {
    super(
      "Codex on Windows needs symlink permission. Turn on Developer Mode in Windows Settings (System, For developers), then connect Codex again.",
    );
    this.name = "CodexSymlinkUnavailableError";
  }
}

export type CodexRuntime = {
  codexHome: string;
  catalogPath: string;
};

export async function prepareCodexRuntime(
  directory: string,
  model = "default",
  signal?: AbortSignal,
  deps: { symlink: typeof symlink; platform: NodeJS.Platform } = {
    symlink,
    platform: process.platform,
  },
): Promise<CodexRuntime> {
  const codexHomePath = join(directory, "codex-home");
  await mkdir(codexHomePath, { recursive: true, mode: 0o700 });
  const codexHome = await realpath(codexHomePath);
  const sourceHome = resolve(
    process.env.CODEX_HOME ?? join(homedir(), ".codex"),
  );
  try {
    await deps.symlink(
      join(sourceHome, "auth.json"),
      join(codexHome, "auth.json"),
    );
  } catch (error) {
    // Provider credentials are never copied: a copy would outlive a crash in
    // the temp directory and swallow token rotation. A hard link is rejected
    // too: it cannot cross volumes (temp and profile may differ) and, like the
    // symlink, loses a rotated token when Codex replaces the file by rename.
    // Windows refuses symlinks without Developer Mode, so Codex is gated there.
    if (
      deps.platform === "win32" &&
      error instanceof Error &&
      "code" in error &&
      error.code === "EPERM"
    )
      throw new CodexSymlinkUnavailableError();
    throw error;
  }
  const bundled = await loadBundledCodexCatalog(directory, codexHome, signal);
  const models = bundled.models.map(isolatedCodexModel);
  if (model !== "default" && !models.some((entry) => entry.slug === model)) {
    const fallback = models.toSorted(
      (left, right) => Number(right.priority ?? 0) - Number(left.priority ?? 0),
    )[0];
    if (!fallback) throw new Error("Codex model catalog is unavailable.");
    models.push({
      ...fallback,
      slug: model,
      display_name: model,
      priority: 0,
      visibility: "hide",
    });
  }
  const catalogPath = join(directory, "codex-models.json");
  await writeFile(catalogPath, JSON.stringify({ models }), { mode: 0o600 });
  return { codexHome, catalogPath };
}

export function codexRuntimeArgs(runtime: CodexRuntime) {
  return [
    "-c",
    'cli_auth_credentials_store="file"',
    "-c",
    `model_catalog_json=${JSON.stringify(runtime.catalogPath)}`,
  ];
}

function supportsClaudeIsolation(result: CliResult): boolean {
  if (result.code !== 0) return false;
  const version = `${result.stdout}\n${result.stderr}`.match(
    /\b(\d+)\.(\d+)\.(\d+)\b/,
  );
  if (!version) return false;
  const [, majorText = "0", minorText = "0", patchText = "0"] = version;
  const [major = 0, minor = 0, patch = 0] = [
    majorText,
    minorText,
    patchText,
  ].map(Number);
  return (
    major > 2 || (major === 2 && (minor > 1 || (minor === 1 && patch >= 248)))
  );
}

function supportsCodexIsolation(
  capability: CliResult,
  promptInput: CliResult,
  effectiveCatalog: CliResult,
  codexHome: string,
): boolean {
  const visiblePrompt = `${promptInput.stdout}\n${promptInput.stderr}`;
  const skillBlocks = [
    ...visiblePrompt.matchAll(
      /<skills_instructions>([\s\S]*?)<\/skills_instructions>/gi,
    ),
  ];
  const isolatedSystemSkills = join(codexHome, "skills/.system");
  const skillRootsAreBundled = skillBlocks.every(([, block = ""]) => {
    const roots = [...block.matchAll(/- `r\d+` = `([^`]+)`/g)].map(
      (match) => match[1],
    );
    return (
      roots.length > 0 && roots.every((root) => root === isolatedSystemSkills)
    );
  });
  let nativeToolsAreDisabled = false;
  try {
    const catalog = codexCatalogSchema.parse(
      JSON.parse(effectiveCatalog.stdout),
    );
    nativeToolsAreDisabled = catalog.models.every(
      (model) =>
        model.shell_type === "disabled" &&
        model.apply_patch_tool_type == null &&
        Array.isArray(model.experimental_supported_tools) &&
        model.experimental_supported_tools.length === 0 &&
        model.supports_search_tool === false &&
        model.tool_mode == null &&
        model.node_repl_disabled === true,
    );
  } catch {
    nativeToolsAreDisabled = false;
  }
  return (
    capability.code !== 0 &&
    /Failed to read output schema file/i.test(capability.stderr) &&
    !/unknown configuration field|unexpected argument/i.test(
      capability.stderr,
    ) &&
    promptInput.code === 0 &&
    effectiveCatalog.code === 0 &&
    !/<(?:plugins|apps)_instructions>/i.test(visiblePrompt) &&
    skillRootsAreBundled &&
    nativeToolsAreDisabled
  );
}

async function findCodexCredentialStore(signal?: AbortSignal) {
  for (const credentialStore of ["file", "keyring"] as const) {
    const result = await runCli({
      provider: "codex",
      cwd: homedir(),
      timeoutMs: 15_000,
      signal,
      args: [
        "-c",
        `cli_auth_credentials_store=${JSON.stringify(credentialStore)}`,
        "login",
        "status",
      ],
    });
    if (
      result.code === 0 &&
      /logged in using ChatGPT/i.test(`${result.stdout}\n${result.stderr}`)
    )
      return credentialStore;
  }
}

export async function checkCliConnection(
  provider: CliProvider,
  signal?: AbortSignal,
): Promise<OkResult> {
  try {
    if (provider === "codex") {
      const codexCredentialStore = await findCodexCredentialStore(signal);
      if (!codexCredentialStore)
        return { ok: false, error: loginHint(provider) };
      if (codexCredentialStore === "keyring")
        return {
          ok: false,
          error:
            "Pond requires file-backed Codex credentials for an isolated connection. Run codex -c 'cli_auth_credentials_store=\"file\"' login, then connect again.",
        };
      const directory = await mkdtemp(join(tmpdir(), "pond-codex-isolation-"));
      try {
        const runtime = await prepareCodexRuntime(directory, "default", signal);
        const runtimeArgs = codexRuntimeArgs(runtime);
        const [capability, promptInput, effectiveCatalog] = await Promise.all([
          runCli({
            provider,
            cwd: directory,
            codexHome: runtime.codexHome,
            timeoutMs: 15_000,
            signal,
            args: [
              "exec",
              ...CODEX_ISOLATION_ARGS,
              ...runtimeArgs,
              "--output-schema",
              join(directory, "missing-schema.json"),
              "Pond isolation compatibility check.",
            ],
          }),
          runCli({
            provider,
            cwd: directory,
            codexHome: runtime.codexHome,
            timeoutMs: 15_000,
            signal,
            args: [
              "debug",
              "prompt-input",
              ...CODEX_ISOLATION_CONFIG_ARGS,
              ...runtimeArgs,
              "Pond isolation compatibility check.",
            ],
          }),
          runCli({
            provider,
            cwd: directory,
            codexHome: runtime.codexHome,
            timeoutMs: 15_000,
            signal,
            args: ["debug", "models", ...runtimeArgs],
          }),
        ]);
        if (
          supportsCodexIsolation(
            capability,
            promptInput,
            effectiveCatalog,
            runtime.codexHome,
          )
        )
          return { ok: true };
        return {
          ok: false,
          error:
            "This Codex version cannot provide Pond's isolated runtime. Update Codex and try again.",
        };
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    } else {
      const result = await runCli({
        provider,
        cwd: homedir(),
        timeoutMs: 15_000,
        signal,
        args: ["auth", "status", "--json"],
      });
      const auth = z
        .object({ loggedIn: z.boolean(), authMethod: z.string() })
        .safeParse(JSON.parse(result.stdout || "null"));
      const subscriptionLogin =
        result.code === 0 &&
        auth.success &&
        auth.data.loggedIn &&
        ["claude.ai", "oauth_token"].includes(auth.data.authMethod);
      if (!subscriptionLogin) return { ok: false, error: loginHint(provider) };
      const capability = await runCli({
        provider,
        cwd: homedir(),
        timeoutMs: 15_000,
        signal,
        args: [
          ...claudeInvocationArgs({
            schema: '{"type":"object"}',
            systemPrompt: "Pond Claude Code capability check.",
          }),
          "--version",
        ],
      });
      if (supportsClaudeIsolation(capability)) return { ok: true };
      return {
        ok: false,
        error: "Update Claude Code to v2.1.248 or later, then connect again.",
      };
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : loginHint(provider),
    };
  }
}
