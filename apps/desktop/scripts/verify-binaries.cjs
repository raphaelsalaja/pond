const { spawnSync } = require("node:child_process");
const { existsSync, readdirSync, rmSync, statSync } = require("node:fs");
const { join, sep } = require("node:path");
const { z } = require("zod");

/** Fails the pack when a bundled binary or the extension is missing; yt-dlp is fetched into userData at runtime. */
exports.default = (context) => verify(context);

async function verify(context, { runFfmpeg = runFfmpegVersion } = {}) {
  const platform = normalizePlatform(context.electronPlatformName);
  const resourcesDir = resolveResourcesDir(context, platform);
  const arch = normalizeArch(context.arch);
  pruneOnnxRuntime(resourcesDir, platform, arch);
  pruneBetterSqlitePrebuilds(resourcesDir, platform, arch);
  if (platform === "darwin") verifySharpRuntime(resourcesDir, arch);
  if (platform === "win32") {
    verifySharpWindowsRuntime(resourcesDir, arch);
    verifyOnnxRuntime(resourcesDir, platform, arch);
    assertAppIcon(context);
  }
  const ffmpegPath = join(resourcesDir, "bin", ffmpegName(platform));
  const nativeHostPath = join(resourcesDir, "bin", nativeHostName(platform));

  assertPresent(ffmpegPath, "ffmpeg");
  // A binary built for another OS cannot be executed on the packaging host.
  if (platform === "win32" && process.platform === platform) {
    const result = runFfmpeg(ffmpegPath);
    if (result.error || result.status !== 0) {
      throw new Error(
        `[pond verify] bundled ffmpeg at ${ffmpegPath} does not run: ` +
          `${result.error?.message ?? `exit status ${result.status}`}`,
      );
    }
  }
  if (platform === "darwin" || platform === "win32") {
    assertPresent(
      betterSqlitePath(resourcesDir, platform, arch),
      "better-sqlite3 native module",
    );
    assertPresent(
      sqliteVecPath(resourcesDir, platform, arch),
      "sqlite-vec native module",
    );
    assertPresent(nativeHostPath, "pond-native-host");
    assertPresent(
      join(resourcesDir, "extension", "manifest.json"),
      "browser extension",
    );
  }

  console.log(`[pond verify] bundled ffmpeg OK (${platform})`);
}

function runFfmpegVersion(ffmpegPath) {
  return spawnSync(ffmpegPath, ["-version"], {
    stdio: "ignore",
    timeout: 10_000,
    windowsHide: true,
  });
}

function assertAppIcon(context) {
  const buildResources = context.packager.info.buildResourcesDir;
  if (
    !["icon.ico", "icon.png"].some((name) =>
      existsSync(join(buildResources, name)),
    )
  ) {
    throw new Error(
      `[pond verify] missing app icon in ${buildResources}. ` +
        "Run prepare-app-icon so the installer does not ship the Electron icon.",
    );
  }
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

function pruneOnnxRuntime(resourcesDir, platform, arch) {
  const runtimeRoot = join(
    resourcesDir,
    "app.asar.unpacked",
    "node_modules",
    "onnxruntime-node",
    "bin",
    "napi-v6",
  );
  if (!existsSync(runtimeRoot)) return;

  for (const platformName of readdirSync(runtimeRoot)) {
    const platformDir = join(runtimeRoot, platformName);
    if (platformName !== platform) {
      rmSync(platformDir, { recursive: true, force: true });
      continue;
    }
    if (!arch || arch === "universal") continue;
    for (const archName of readdirSync(platformDir)) {
      if (archName !== arch) {
        rmSync(join(platformDir, archName), { recursive: true, force: true });
      }
    }
  }
}

function pruneBetterSqlitePrebuilds(resourcesDir, platform, arch) {
  if (arch === "universal") return;
  const prebuilds = join(
    resourcesDir,
    "app.asar.unpacked",
    "node_modules",
    "better-sqlite3",
    "prebuilds",
  );
  if (!existsSync(prebuilds)) return;
  const expected = `${platform}-${arch}.node`;
  for (const filename of readdirSync(prebuilds)) {
    if (filename !== expected)
      rmSync(join(prebuilds, filename), { force: true });
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
  return join(
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
  return join(
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
    return join(
      context.appOutDir,
      `${productFilename}.app`,
      "Contents",
      "Resources",
    );
  }
  return join(context.appOutDir, "resources");
}

function verifySharpRuntime(resourcesDir, arch) {
  if (arch !== "arm64" && arch !== "x64") return;
  const unpacked = join(resourcesDir, "app.asar.unpacked");
  const other = arch === "arm64" ? "x64" : "arm64";
  removeSharpPackages(unpacked, other);
  const files = listFiles(unpacked);
  const runtime = files.find(
    (file) =>
      file.includes(`${sep}@img${sep}sharp-darwin-${arch}${sep}`) &&
      file.endsWith(".node"),
  );
  const libvips = files.find(
    (file) =>
      file.includes(`${sep}@img${sep}sharp-libvips-darwin-${arch}${sep}`) &&
      file.endsWith(".dylib"),
  );
  if (!runtime || !libvips) {
    throw new Error(
      `[pond verify] missing sharp darwin-${arch} runtime under ${unpacked}. ` +
        `A ${arch} Mac cannot launch without it.`,
    );
  }
}

function verifySharpWindowsRuntime(resourcesDir, arch) {
  if (arch !== "arm64" && arch !== "x64") return;
  const lib = join(
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

function verifyOnnxRuntime(resourcesDir, platform, arch) {
  const directory = join(
    resourcesDir,
    "app.asar.unpacked",
    "node_modules",
    "onnxruntime-node",
    "bin",
    "napi-v6",
    platform,
    arch,
  );
  for (const file of ["onnxruntime_binding.node", "onnxruntime.dll"]) {
    assertPresent(join(directory, file), `onnxruntime ${file}`);
  }
}

function removeSharpPackages(root, arch) {
  const imagePackages = join(root, "node_modules", "@img");
  for (const name of [`sharp-darwin-${arch}`, `sharp-libvips-darwin-${arch}`]) {
    rmSync(join(imagePackages, name), { recursive: true, force: true });
  }
}

function listFiles(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { recursive: true }).map((entry) =>
    join(root, String(entry)),
  );
}

exports.verifySharpRuntime = verifySharpRuntime;
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
