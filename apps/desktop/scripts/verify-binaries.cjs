const { spawnSync } = require("node:child_process");
const {
  closeSync,
  existsSync,
  openSync,
  readdirSync,
  readSync,
  rmSync,
  statSync,
} = require("node:fs");
const { createRequire } = require("node:module");
const nodePath = require("node:path");
const { z } = require("zod");
const { verifyRuntimePackages } = require("./verify-runtime-packages.cjs");

/** Fails the pack when a bundled binary is missing; yt-dlp is fetched into userData at runtime. */
exports.default = (context) => verify(context);

async function verify(
  context,
  {
    runBinaryVersion = runVersionProbe,
    runOnnx = runOnnxSmoke,
    readArchs = lipoArchs,
    runRenderSmoke = runPostRendererSmoke,
  } = {},
) {
  const platform = normalizePlatform(context.electronPlatformName);
  const resourcesDir = resolveResourcesDir(context, platform);
  const arch = normalizeArch(context.arch);
  pruneOnnxRuntime(resourcesDir, platform, arch);
  pruneBetterSqlitePrebuilds(resourcesDir, platform, arch);
  await verifyRuntimePackages(resourcesDir);
  if (platform === "darwin") verifySharpRuntime(resourcesDir, arch);
  if (platform === "linux") verifySharpLinuxRuntime(resourcesDir, arch);
  if (platform === "win32") verifySharpWindowsRuntime(resourcesDir, arch);
  if (platform === "win32" || platform === "linux") assertAppIcon(context);
  if (platform === "darwin") assertIconCatalog(resourcesDir);
  if (platform === "darwin") {
    assertPostRenderer(resourcesDir);
    // It reads Arial, Hiragino and Apple Color Emoji from the running Mac.
    if (process.platform === "darwin") {
      const renderDir = nodePath.join(resourcesDir, "render");
      const result = runRenderSmoke(renderDir);
      if (result.error || result.status !== 0) {
        throw new Error(
          `[pond verify] packaged post renderer at ${renderDir} failed to draw X, Threads and Bluesky posts: ` +
            `${result.error?.message ?? (lastLines(result.stdout) || `exit status ${result.status}`)}`,
        );
      }
    }
  }
  assertTintIcons(resourcesDir);
  const onnxShipped = verifyOnnxRuntime(resourcesDir, platform, arch);
  const ffmpegPath = nodePath.join(resourcesDir, "bin", ffmpegName(platform));
  const nativeHostPath = nodePath.join(
    resourcesDir,
    "bin",
    nativeHostName(platform),
  );

  const ffprobePath = nodePath.join(
    resourcesDir,
    "bin",
    platform === "win32" ? "ffprobe.exe" : "ffprobe",
  );
  assertPresent(ffmpegPath, "ffmpeg");
  assertPresent(ffprobePath, "ffprobe");
  // Another OS can't run it, and Rosetta's first launch of another arch outlasts
  // the timeout, so verifyMacSlices covers cross-arch Mac builds instead.
  const runnable = arch === process.arch || arch === "universal";
  if (process.platform === platform && runnable) {
    for (const [binary, label] of [
      [ffmpegPath, "ffmpeg"],
      [ffprobePath, "ffprobe"],
    ]) {
      const result = runBinaryVersion(binary);
      if (result.error || result.status !== 0) {
        throw new Error(
          `[pond verify] bundled ${label} at ${binary} does not run: ` +
            `${result.error?.message ?? `exit status ${result.status}`}`,
        );
      }
    }
  }
  if (onnxShipped && process.platform === platform && arch === process.arch) {
    const packageDir = onnxPackageDir(resourcesDir);
    const result = runOnnx(packageDir);
    if (result.error || result.status !== 0) {
      throw new Error(
        `[pond verify] bundled onnxruntime-node at ${packageDir} cannot run a CPU session: ` +
          `${result.error?.message ?? (result.stderr?.trim() || `exit status ${result.status}`)}`,
      );
    }
  }
  if (platform === "darwin" || platform === "win32" || platform === "linux") {
    assertPresent(
      betterSqlitePath(resourcesDir, platform, arch),
      "better-sqlite3 native module",
    );
    assertPresent(
      sqliteVecPath(resourcesDir, platform, arch),
      "sqlite-vec native module",
    );
    assertPresent(nativeHostPath, "pond-native-host");
  }
  if (platform === "darwin" && process.platform === "darwin") {
    verifyMacSlices(resourcesDir, arch, readArchs);
  }

  console.log(`[pond verify] bundled ffmpeg and ffprobe OK (${platform})`);
}

const MAC_SLICES = new Map([
  ["arm64", ["arm64"]],
  ["x64", ["x86_64"]],
  ["universal", ["arm64", "x86_64"]],
]);

/** One runner packages both Mac builds, so each helper must carry the packed arch's slice. */
function verifyMacSlices(resourcesDir, arch, readArchs = lipoArchs) {
  const wanted = MAC_SLICES.get(arch);
  if (!wanted) return;
  for (const name of ["ffmpeg", "ffprobe", "pond-native-host"]) {
    const path = nodePath.join(resourcesDir, "bin", name);
    const archs = readArchs(path);
    const missing = wanted.filter((slice) => !archs.includes(slice));
    if (missing.length > 0) {
      throw new Error(
        `[pond verify] bundled ${name} at ${path} is ${archs.join(", ") || "unreadable"}, ` +
          `missing ${missing.join(", ")}. The ${arch} build cannot run it.`,
      );
    }
  }
}

function lipoArchs(path) {
  const result = spawnSync("lipo", ["-archs", path], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim().split(/\s+/) : [];
}

function runVersionProbe(binaryPath) {
  return spawnSync(binaryPath, ["-version"], {
    stdio: "ignore",
    timeout: 10_000,
    windowsHide: true,
  });
}

function assertAppIcon(context) {
  const buildResources = context.packager.info.buildResourcesDir;
  if (
    !["icon.ico", "icon.png"].some((name) =>
      existsSync(nodePath.join(buildResources, name)),
    )
  ) {
    throw new Error(
      `[pond verify] missing app icon in ${buildResources}. ` +
        "Run prepare-app-icon so the installer does not ship the Electron icon.",
    );
  }
}

/** Without the catalog, macOS 26+ draws icon.icns and the icon ignores Dark, Clear, and Tinted styles. */
function assertIconCatalog(resourcesDir) {
  const catalog = nodePath.join(resourcesDir, "Assets.car");
  if (!existsSync(catalog)) {
    throw new Error(
      `[pond verify] missing ${catalog}. ` +
        "Run prepare-app-icon with Xcode 27 or later so actool can compile icon.icon.",
    );
  }
  if (statSync(catalog).size === 0) {
    throw new Error(`[pond verify] ${catalog} is empty.`);
  }
}

function assertTintIcons(resourcesDir) {
  const dir = nodePath.join(resourcesDir, "app-icons");
  const tints = existsSync(dir)
    ? readdirSync(dir).filter((tint) =>
        existsSync(nodePath.join(dir, tint, "default.png")),
      )
    : [];
  if (tints.length === 0) {
    throw new Error(
      `[pond verify] no tint icons in ${dir}. ` +
        "Run prepare-dock-icons so the app icon picker is not empty.",
    );
  }
}

const WASM_MAGIC = Buffer.from([0x00, 0x61, 0x73, 0x6d]);
const INTER_FACES = [
  "Inter-Regular.otf",
  "Inter-Medium.otf",
  "Inter-SemiBold.otf",
  "Inter-Bold.otf",
];

/** Only macOS draws posts natively; without the build X and Threads fall back to the React card and Bluesky gets no card. */
function assertPostRenderer(resourcesDir) {
  const dir = nodePath.join(resourcesDir, "render");
  const hint =
    "Run `node packages/render/scripts/build.mjs --required` with the pinned xeet fork before packaging.";
  const wasm = nodePath.join(dir, "pond-render.wasm");
  if (!existsSync(wasm)) {
    throw new Error(`[pond verify] missing post renderer at ${wasm}. ${hint}`);
  }
  const head = Buffer.alloc(WASM_MAGIC.length);
  const fd = openSync(wasm, "r");
  try {
    readSync(fd, head, 0, head.length, 0);
  } finally {
    closeSync(fd);
  }
  if (!head.equals(WASM_MAGIC)) {
    throw new Error(
      `[pond verify] ${wasm} is not a WebAssembly module. ${hint}`,
    );
  }
  const fontsDir = nodePath.join(dir, "fonts");
  const fonts = existsSync(fontsDir) ? readdirSync(fontsDir) : [];
  const missing = [...INTER_FACES, "OFL.txt"].filter(
    (name) => !fonts.includes(name),
  );
  if (!fonts.some((name) => name.startsWith("Noto"))) missing.push("Noto*");
  if (!fonts.some((name) => name.startsWith("STIX"))) missing.push("STIX*");
  if (missing.length > 0) {
    throw new Error(
      `[pond verify] post renderer fonts in ${fontsDir} are missing ${missing.join(", ")}. ${hint}`,
    );
  }
}

const RENDER_PACKAGE = nodePath.resolve(__dirname, "../../../packages/render");

/** Renders recorded posts through the packed wasm and fonts with `@pond/render`'s `smoke:packaged`. */
function runPostRendererSmoke(renderDir) {
  const vitest = nodePath.join(
    nodePath.dirname(
      require.resolve("vitest/package.json", { paths: [RENDER_PACKAGE] }),
    ),
    "vitest.mjs",
  );
  return spawnSync(
    process.execPath,
    [vitest, "run", "--config", "vitest.smoke.config.ts"],
    {
      cwd: RENDER_PACKAGE,
      encoding: "utf8",
      env: { ...process.env, POND_RENDER_DIR: renderDir },
      timeout: 120_000,
    },
  );
}

function lastLines(output, count = 30) {
  return (output ?? "").trim().split("\n").slice(-count).join("\n");
}

const ARCH_NAMES = ["ia32", "x64", "armv7l", "arm64", "universal"];

function normalizeArch(arch) {
  return z
    .union([
      z
        .number()
        .int()
        .min(0)
        .max(4)
        .transform((index) => ARCH_NAMES[index]),
      z.enum(ARCH_NAMES),
    ])
    .parse(arch);
}

/** Pond only creates CPU sessions: GPU providers load lazily and never run, and the versioned dylib copies the one the binding links. */
const UNUSED_ONNX_FILES = {
  darwin: /^libonnxruntime\.\d+\.\d+\.\d+\.dylib$/,
  linux: /^libonnxruntime_providers_(cuda|tensorrt)\.so$/,
  win32: /^(DirectML|dxcompiler|dxil)\.dll$/,
};

function onnxPackageDir(resourcesDir) {
  return nodePath.join(
    resourcesDir,
    "app.asar.unpacked",
    "node_modules",
    "onnxruntime-node",
  );
}

function pruneOnnxRuntime(resourcesDir, platform, arch) {
  const runtimeRoot = nodePath.join(
    onnxPackageDir(resourcesDir),
    "bin",
    "napi-v6",
  );
  if (!existsSync(runtimeRoot)) {
    return;
  }

  for (const platformName of readdirSync(runtimeRoot)) {
    const platformDir = nodePath.join(runtimeRoot, platformName);
    if (platformName !== platform) {
      rmSync(platformDir, { recursive: true, force: true });
      continue;
    }
    for (const archName of readdirSync(platformDir)) {
      const archDir = nodePath.join(platformDir, archName);
      if (arch && arch !== "universal" && archName !== arch) {
        rmSync(archDir, { recursive: true, force: true });
        continue;
      }
      const unused = UNUSED_ONNX_FILES[platform];
      for (const file of readdirSync(archDir)) {
        if (unused?.test(file)) {
          rmSync(nodePath.join(archDir, file), { force: true });
        }
      }
    }
  }
}

/** The packaged package keeps onnxruntime-common inside app.asar, so plain Node resolves it from the workspace instead. */
function runOnnxSmoke(packageDir) {
  const requireOnnx = createRequire(
    createRequire(require.resolve("@huggingface/transformers")).resolve(
      "onnxruntime-node",
    ),
  );
  const common = requireOnnx.resolve("onnxruntime-common");
  const modulesDir = common.slice(
    0,
    common.lastIndexOf(`${nodePath.sep}onnxruntime-common${nodePath.sep}`),
  );
  return spawnSync(
    process.execPath,
    [nodePath.join(__dirname, "onnx-cpu-smoke.cjs"), packageDir],
    {
      encoding: "utf8",
      env: { ...process.env, NODE_PATH: modulesDir },
      timeout: 60_000,
      windowsHide: true,
    },
  );
}

function pruneBetterSqlitePrebuilds(resourcesDir, platform, arch) {
  if (arch === "universal") {
    return;
  }
  const prebuilds = nodePath.join(
    resourcesDir,
    "app.asar.unpacked",
    "node_modules",
    "better-sqlite3",
    "prebuilds",
  );
  if (!existsSync(prebuilds)) return;
  const expected = `${platform}-${arch}.node`;
  for (const filename of readdirSync(prebuilds)) {
    if (filename !== expected) {
      rmSync(nodePath.join(prebuilds, filename), { force: true });
    }
  }
}

function normalizePlatform(electronPlatformName) {
  if (electronPlatformName === "mas") return "darwin";
  return electronPlatformName;
}

function ffmpegName(platform) {
  return platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
}

function nativeHostName(platform) {
  return platform === "win32" ? "pond-native-host.exe" : "pond-native-host";
}

function betterSqlitePath(resourcesDir, platform, arch) {
  return nodePath.join(
    resourcesDir,
    "app.asar.unpacked",
    "node_modules",
    "better-sqlite3",
    "prebuilds",
    `${platform}-${arch}.node`,
  );
}

function sqliteVecPath(resourcesDir, platform, arch) {
  const os = platform === "win32" ? "windows" : platform;
  const extension =
    platform === "win32" ? "dll" : platform === "darwin" ? "dylib" : "so";
  return nodePath.join(
    resourcesDir,
    "app.asar.unpacked",
    "node_modules",
    `sqlite-vec-${os}-${arch}`,
    `vec0.${extension}`,
  );
}

function resolveResourcesDir(context, platform) {
  if (platform === "darwin") {
    const productFilename = context.packager.appInfo.productFilename;
    return nodePath.join(
      context.appOutDir,
      `${productFilename}.app`,
      "Contents",
      "Resources",
    );
  }
  return nodePath.join(context.appOutDir, "resources");
}

function verifySharpRuntime(resourcesDir, arch) {
  if (arch !== "arm64" && arch !== "x64") {
    return;
  }
  const unpacked = nodePath.join(resourcesDir, "app.asar.unpacked");
  const other = arch === "arm64" ? "x64" : "arm64";
  removeSharpPackages(unpacked, other);
  const files = listFiles(unpacked);
  const runtime = files.find(
    (file) =>
      file.includes(
        `${nodePath.sep}@img${nodePath.sep}sharp-darwin-${arch}${nodePath.sep}`,
      ) && file.endsWith(".node"),
  );
  const libvips = files.find(
    (file) =>
      file.includes(
        `${nodePath.sep}@img${nodePath.sep}sharp-libvips-darwin-${arch}${nodePath.sep}`,
      ) && file.endsWith(".dylib"),
  );
  if (!runtime || !libvips) {
    throw new Error(
      `[pond verify] missing sharp darwin-${arch} runtime under ${unpacked}. ` +
        `A ${arch} Mac cannot launch without it.`,
    );
  }
}

function verifySharpLinuxRuntime(resourcesDir, arch) {
  if (arch !== "arm64" && arch !== "x64") {
    return;
  }
  const unpacked = nodePath.join(resourcesDir, "app.asar.unpacked");
  const files = listFiles(unpacked);
  const runtime = files.find(
    (file) =>
      file.includes(
        `${nodePath.sep}@img${nodePath.sep}sharp-linux-${arch}${nodePath.sep}`,
      ) && file.endsWith(".node"),
  );
  const libvips = files.find(
    (file) =>
      file.includes(
        `${nodePath.sep}@img${nodePath.sep}sharp-libvips-linux-${arch}${nodePath.sep}`,
      ) && file.includes(`${nodePath.sep}libvips-cpp.so`),
  );
  if (!runtime || !libvips) {
    throw new Error(
      `[pond verify] missing sharp linux-${arch} runtime under ${unpacked}. ` +
        "A Linux install cannot generate thumbnails without it.",
    );
  }
}

function verifySharpWindowsRuntime(resourcesDir, arch) {
  if (arch !== "arm64" && arch !== "x64") {
    return;
  }
  const lib = nodePath.join(
    resourcesDir,
    "app.asar.unpacked",
    "node_modules",
    "@img",
    `sharp-win32-${arch}`,
    "lib",
  );
  const files = existsSync(lib) ? readdirSync(lib) : [];
  const runtime = files.some((file) => file.endsWith(".node"));
  const libvips = files.some(
    (file) => file.startsWith("libvips") && file.endsWith(".dll"),
  );
  if (!runtime || !libvips) {
    throw new Error(
      `[pond verify] missing sharp win32-${arch} runtime under ${lib}. ` +
        "A Windows install cannot generate thumbnails without it.",
    );
  }
}

const ONNX_LIBRARY = {
  darwin: "libonnxruntime.1.dylib",
  linux: "libonnxruntime.so.1",
  win32: "onnxruntime.dll",
};

/** onnxruntime-node 1.30 publishes no Intel Mac binary, so there is nothing to bundle. */
const UNPUBLISHED_ONNX_TARGETS = new Set(["darwin-x64"]);

function verifyOnnxRuntime(resourcesDir, platform, arch) {
  if (arch === "universal" || !ONNX_LIBRARY[platform]) {
    return false;
  }
  if (UNPUBLISHED_ONNX_TARGETS.has(`${platform}-${arch}`)) {
    return false;
  }
  const directory = nodePath.join(
    onnxPackageDir(resourcesDir),
    "bin",
    "napi-v6",
    platform,
    arch,
  );
  for (const file of ["onnxruntime_binding.node", ONNX_LIBRARY[platform]]) {
    assertPresent(nodePath.join(directory, file), `onnxruntime ${file}`);
  }
  return true;
}

function removeSharpPackages(root, arch) {
  const imagePackages = nodePath.join(root, "node_modules", "@img");
  for (const name of [`sharp-darwin-${arch}`, `sharp-libvips-darwin-${arch}`]) {
    rmSync(nodePath.join(imagePackages, name), {
      recursive: true,
      force: true,
    });
  }
}

function listFiles(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { recursive: true }).map((entry) =>
    nodePath.join(root, String(entry)),
  );
}

exports.pruneOnnxRuntime = pruneOnnxRuntime;
exports.verifySharpRuntime = verifySharpRuntime;
exports.verifyMacSlices = verifyMacSlices;
exports.verify = verify;

function assertPresent(path, label) {
  if (!existsSync(path)) {
    throw new Error(
      `[pond verify] missing bundled ${label} at ${path}. ` +
        "Release builds must ship it. Confirm electron-builder " +
        "extraResources copied it.",
    );
  }
  if (statSync(path).size === 0) {
    throw new Error(`[pond verify] bundled ${label} at ${path} is empty.`);
  }
}

exports.ffmpegName = ffmpegName;
exports.nativeHostName = nativeHostName;
exports.normalizePlatform = normalizePlatform;
exports.resolveResourcesDir = resolveResourcesDir;
exports.betterSqlitePath = betterSqlitePath;
exports.sqliteVecPath = sqliteVecPath;
