const assert = require("node:assert/strict");
const { existsSync, readdirSync } = require("node:fs");
const { mkdir, mkdtemp, rm, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");
const verifyBinaries = require("./verify-binaries.cjs");

function buildContext(appOutDir, electronPlatformName, arch = "x64") {
  return {
    appOutDir,
    arch,
    electronPlatformName,
    packager: {
      appInfo: { productFilename: "Pond" },
      info: { buildResourcesDir: join(appOutDir, "build") },
    },
  };
}

/** Packaging hosts that are not the target platform skip host-only probes; the fakes keep runs identical. */
function verify(context) {
  const slices =
    context.arch === "arm64"
      ? ["arm64"]
      : context.arch === "universal"
        ? ["arm64", "x86_64"]
        : ["x86_64"];
  return verifyBinaries.verify(context, {
    runFfmpeg: () => ({ status: 0 }),
    runOnnx: () => ({ status: 0 }),
    readArchs: () => slices,
  });
}

async function withTemporaryDirectory(run) {
  const directory = await mkdtemp(join(tmpdir(), "pond-packaging-test-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function writeTintIcon(resourcesDirectory) {
  const tint = join(resourcesDirectory, "app-icons", "aqua");
  await mkdir(tint, { recursive: true });
  await writeFile(join(tint, "default.png"), "binary");
}

async function writeWindowsRuntime(resourcesDirectory, options = {}) {
  const binaryDirectory = join(resourcesDirectory, "bin");
  await mkdir(binaryDirectory, { recursive: true });
  await writeFile(join(binaryDirectory, "ffmpeg.exe"), "binary");
  if (options.nativeHost !== false) {
    await writeFile(join(binaryDirectory, "pond-native-host.exe"), "binary");
  }
  await mkdir(
    join(
      resourcesDirectory,
      "app.asar.unpacked/node_modules/better-sqlite3/prebuilds",
    ),
    { recursive: true },
  );
  await writeFile(
    verifyBinaries.betterSqlitePath(resourcesDirectory, "win32", "x64"),
    "binary",
  );
  const sqliteVec = verifyBinaries.sqliteVecPath(
    resourcesDirectory,
    "win32",
    "x64",
  );
  await mkdir(join(sqliteVec, ".."), { recursive: true });
  await writeFile(sqliteVec, "binary");
  if (options.sharp !== false) {
    const lib = join(
      resourcesDirectory,
      "app.asar.unpacked/node_modules/@img/sharp-win32-x64/lib",
    );
    await mkdir(lib, { recursive: true });
    await writeFile(join(lib, "sharp-win32-x64.node"), "binary");
    await writeFile(join(lib, "libvips-42.dll"), "binary");
  }
  if (options.onnx !== false) {
    const bin = join(
      resourcesDirectory,
      "app.asar.unpacked/node_modules/onnxruntime-node/bin/napi-v6/win32/x64",
    );
    await mkdir(bin, { recursive: true });
    await writeFile(join(bin, "onnxruntime_binding.node"), "binary");
    await writeFile(join(bin, "onnxruntime.dll"), "binary");
  }
  if (options.tints !== false) await writeTintIcon(resourcesDirectory);
  if (options.icon !== false) {
    const build = join(resourcesDirectory, "..", "build");
    await mkdir(build, { recursive: true });
    await writeFile(join(build, "icon.png"), "binary");
  }
}

test("uses the executable name required by each packaged platform", () => {
  assert.equal(verifyBinaries.ffmpegName("darwin"), "ffmpeg");
  assert.equal(verifyBinaries.ffmpegName("linux"), "ffmpeg");
  assert.equal(verifyBinaries.ffmpegName("win32"), "ffmpeg.exe");
  assert.equal(verifyBinaries.nativeHostName("darwin"), "pond-native-host");
  assert.equal(verifyBinaries.nativeHostName("linux"), "pond-native-host");
  assert.equal(verifyBinaries.nativeHostName("win32"), "pond-native-host.exe");
});

test("accepts the Windows ffmpeg executable in the packaged resources", async () => {
  await withTemporaryDirectory(async (appOutDir) => {
    await writeWindowsRuntime(join(appOutDir, "resources"));

    await verify(buildContext(appOutDir, "win32"));
  });
});

test("rejects a Windows package containing only the Unix ffmpeg name", async () => {
  await withTemporaryDirectory(async (appOutDir) => {
    const binaryDirectory = join(appOutDir, "resources", "bin");
    await writeWindowsRuntime(join(appOutDir, "resources"));
    await rm(join(binaryDirectory, "ffmpeg.exe"));
    await writeFile(join(binaryDirectory, "ffmpeg"), "binary");

    await assert.rejects(
      verify(buildContext(appOutDir, "win32")),
      /missing bundled ffmpeg.*ffmpeg\.exe/,
    );
  });
});

test("rejects a Windows package without its native-host executable", async () => {
  await withTemporaryDirectory(async (appOutDir) => {
    await writeWindowsRuntime(join(appOutDir, "resources"), {
      nativeHost: false,
    });

    await assert.rejects(
      verify(buildContext(appOutDir, "win32")),
      /missing bundled pond-native-host.*pond-native-host\.exe/,
    );
  });
});

test("rejects a Windows package without the sharp runtime", async () => {
  await withTemporaryDirectory(async (appOutDir) => {
    await writeWindowsRuntime(join(appOutDir, "resources"), { sharp: false });

    await assert.rejects(
      verify(buildContext(appOutDir, "win32")),
      /missing sharp win32-x64 runtime/,
    );
  });
});

test("rejects a Windows package without the onnxruntime libraries", async () => {
  await withTemporaryDirectory(async (appOutDir) => {
    await writeWindowsRuntime(join(appOutDir, "resources"), { onnx: false });

    await assert.rejects(
      verify(buildContext(appOutDir, "win32")),
      /missing bundled onnxruntime onnxruntime_binding.node/,
    );
  });
});

test("rejects a Windows package built without the app icon", async () => {
  await withTemporaryDirectory(async (appOutDir) => {
    await writeWindowsRuntime(join(appOutDir, "resources"), { icon: false });

    await assert.rejects(
      verify(buildContext(appOutDir, "win32")),
      /missing app icon/,
    );
  });
});

test("rejects a package without the tint icons", async () => {
  await withTemporaryDirectory(async (appOutDir) => {
    await writeWindowsRuntime(join(appOutDir, "resources"), { tints: false });

    await assert.rejects(
      verify(buildContext(appOutDir, "win32")),
      /no tint icons/,
    );
  });
});

async function writeMacRuntime(resourcesDirectory, arch, options = {}) {
  const binaryDirectory = join(resourcesDirectory, "bin");
  await mkdir(binaryDirectory, { recursive: true });
  await writeFile(join(binaryDirectory, "ffmpeg"), "binary");
  await writeFile(join(binaryDirectory, "pond-native-host"), "binary");
  await mkdir(
    join(
      resourcesDirectory,
      "app.asar.unpacked/node_modules/better-sqlite3/prebuilds",
    ),
    { recursive: true },
  );
  await writeFile(
    verifyBinaries.betterSqlitePath(resourcesDirectory, "darwin", arch),
    "binary",
  );
  const sqliteVec = verifyBinaries.sqliteVecPath(
    resourcesDirectory,
    "darwin",
    arch,
  );
  await mkdir(join(sqliteVec, ".."), { recursive: true });
  await writeFile(sqliteVec, "binary");
  const sharpDir = join(
    resourcesDirectory,
    `app.asar.unpacked/node_modules/@img/sharp-darwin-${arch}/lib`,
  );
  await mkdir(sharpDir, { recursive: true });
  await writeFile(join(sharpDir, `sharp-darwin-${arch}.node`), "binary");
  const libvipsDir = join(
    resourcesDirectory,
    `app.asar.unpacked/node_modules/@img/sharp-libvips-darwin-${arch}/lib`,
  );
  await mkdir(libvipsDir, { recursive: true });
  await writeFile(join(libvipsDir, "libvips.dylib"), "binary");
  if (arch === "arm64") {
    const onnxDir = join(
      resourcesDirectory,
      "app.asar.unpacked/node_modules/onnxruntime-node/bin/napi-v6/darwin/arm64",
    );
    await mkdir(onnxDir, { recursive: true });
    await writeFile(join(onnxDir, "onnxruntime_binding.node"), "binary");
    await writeFile(join(onnxDir, "libonnxruntime.1.dylib"), "binary");
  }
  await writeTintIcon(resourcesDirectory);
  if (options.catalog !== false) {
    await writeFile(
      join(resourcesDirectory, "Assets.car"),
      options.catalog ?? "binary",
    );
  }
}

for (const arch of ["arm64", "x64"]) {
  test(`accepts a macOS ${arch} package with the Icon Composer catalog`, async () => {
    await withTemporaryDirectory(async (appOutDir) => {
      const resources = join(appOutDir, "Pond.app", "Contents", "Resources");
      await writeMacRuntime(resources, arch);

      await verify(buildContext(appOutDir, "darwin", arch));
    });
  });

  test(`rejects a macOS ${arch} package without the Icon Composer catalog`, async () => {
    await withTemporaryDirectory(async (appOutDir) => {
      const resources = join(appOutDir, "Pond.app", "Contents", "Resources");
      await writeMacRuntime(resources, arch, { catalog: false });

      await assert.rejects(
        verify(buildContext(appOutDir, "darwin", arch)),
        /missing .*Assets\.car/,
      );
    });
  });
}

test("rejects a macOS package with an empty Icon Composer catalog", async () => {
  await withTemporaryDirectory(async (appOutDir) => {
    const resources = join(appOutDir, "Pond.app", "Contents", "Resources");
    await writeMacRuntime(resources, "arm64", { catalog: "" });

    await assert.rejects(
      verify(buildContext(appOutDir, "darwin", "arm64")),
      /Assets\.car is empty/,
    );
  });
});

async function writeLinuxRuntime(resourcesDirectory, options = {}) {
  const binaryDirectory = join(resourcesDirectory, "bin");
  await mkdir(binaryDirectory, { recursive: true });
  await writeFile(join(binaryDirectory, "ffmpeg"), "binary");
  if (options.nativeHost !== false) {
    await writeFile(join(binaryDirectory, "pond-native-host"), "binary");
  }
  await mkdir(
    join(
      resourcesDirectory,
      "app.asar.unpacked/node_modules/better-sqlite3/prebuilds",
    ),
    { recursive: true },
  );
  await writeFile(
    verifyBinaries.betterSqlitePath(resourcesDirectory, "linux", "x64"),
    "binary",
  );
  const sqliteVec = verifyBinaries.sqliteVecPath(
    resourcesDirectory,
    "linux",
    "x64",
  );
  await mkdir(join(sqliteVec, ".."), { recursive: true });
  await writeFile(sqliteVec, "binary");
  if (options.sharp !== false) {
    const sharp = join(
      resourcesDirectory,
      "app.asar.unpacked/node_modules/@img/sharp-linux-x64/lib",
    );
    await mkdir(sharp, { recursive: true });
    await writeFile(join(sharp, "sharp-linux-x64.node"), "binary");
    const libvips = join(
      resourcesDirectory,
      "app.asar.unpacked/node_modules/@img/sharp-libvips-linux-x64/lib",
    );
    await mkdir(libvips, { recursive: true });
    await writeFile(join(libvips, "libvips-cpp.so.8.18.6"), "binary");
  }
  if (options.onnx !== false) {
    const bin = join(
      resourcesDirectory,
      "app.asar.unpacked/node_modules/onnxruntime-node/bin/napi-v6/linux/x64",
    );
    await mkdir(bin, { recursive: true });
    await writeFile(join(bin, "onnxruntime_binding.node"), "binary");
    await writeFile(join(bin, "libonnxruntime.so.1"), "binary");
  }
  await writeTintIcon(resourcesDirectory);
  const build = join(resourcesDirectory, "..", "build");
  await mkdir(build, { recursive: true });
  await writeFile(join(build, "icon.png"), "binary");
}

test("accepts a Linux package with every native runtime", async () => {
  await withTemporaryDirectory(async (appOutDir) => {
    await writeLinuxRuntime(join(appOutDir, "resources"));

    await verify(buildContext(appOutDir, "linux"));
  });
});

test("rejects a Linux package without its native-host executable", async () => {
  await withTemporaryDirectory(async (appOutDir) => {
    await writeLinuxRuntime(join(appOutDir, "resources"), {
      nativeHost: false,
    });

    await assert.rejects(
      verify(buildContext(appOutDir, "linux")),
      /missing bundled pond-native-host/,
    );
  });
});

test("rejects a Linux package without the sharp runtime", async () => {
  await withTemporaryDirectory(async (appOutDir) => {
    await writeLinuxRuntime(join(appOutDir, "resources"), { sharp: false });

    await assert.rejects(
      verify(buildContext(appOutDir, "linux")),
      /missing sharp linux-x64 runtime/,
    );
  });
});

test("rejects a Linux package without the onnxruntime libraries", async () => {
  await withTemporaryDirectory(async (appOutDir) => {
    await writeLinuxRuntime(join(appOutDir, "resources"), { onnx: false });

    await assert.rejects(
      verify(buildContext(appOutDir, "linux")),
      /missing bundled onnxruntime/,
    );
  });
});

test("rejects a bundled ffmpeg that does not run", {
  skip: process.platform !== "win32",
}, async () => {
  await withTemporaryDirectory(async (appOutDir) => {
    await writeWindowsRuntime(join(appOutDir, "resources"));

    await assert.rejects(
      verifyBinaries.verify(buildContext(appOutDir, "win32"), {
        runFfmpeg: () => ({ status: 1 }),
        runOnnx: () => ({ status: 0 }),
      }),
      /does not run/,
    );
  });
});

const hostPlatform =
  process.platform === "win32" || process.platform === "linux"
    ? process.platform
    : null;

test("rejects an onnxruntime that cannot run a CPU session", {
  skip: !hostPlatform || process.arch !== "x64",
}, async () => {
  await withTemporaryDirectory(async (appOutDir) => {
    const resources = join(appOutDir, "resources");
    if (hostPlatform === "win32") await writeWindowsRuntime(resources);
    else await writeLinuxRuntime(resources);

    await assert.rejects(
      verifyBinaries.verify(buildContext(appOutDir, hostPlatform), {
        runFfmpeg: () => ({ status: 0 }),
        runOnnx: () => ({ status: 1, stderr: "missing DirectML.dll" }),
      }),
      /cannot run a CPU session/,
    );
  });
});

async function writeOnnxFiles(resourcesDirectory, platform, arch, files) {
  const directory = join(
    resourcesDirectory,
    "app.asar.unpacked/node_modules/onnxruntime-node/bin/napi-v6",
    platform,
    arch,
  );
  await mkdir(directory, { recursive: true });
  for (const file of files) await writeFile(join(directory, file), "binary");
  return directory;
}

for (const [platform, kept, pruned] of [
  [
    "darwin",
    ["libonnxruntime.1.dylib", "onnxruntime_binding.node"],
    ["libonnxruntime.1.30.0.dylib"],
  ],
  [
    "linux",
    [
      "libonnxruntime.so.1",
      "libonnxruntime_providers_shared.so",
      "onnxruntime_binding.node",
    ],
    [
      "libonnxruntime_providers_cuda.so",
      "libonnxruntime_providers_tensorrt.so",
    ],
  ],
  [
    "win32",
    ["onnxruntime.dll", "onnxruntime_binding.node"],
    ["DirectML.dll", "dxcompiler.dll", "dxil.dll"],
  ],
]) {
  test(`prunes onnxruntime libraries a ${platform} CPU session never loads`, async () => {
    await withTemporaryDirectory(async (resources) => {
      const directory = await writeOnnxFiles(resources, platform, "x64", [
        ...kept,
        ...pruned,
      ]);
      await writeOnnxFiles(resources, platform, "arm64", kept);

      verifyBinaries.pruneOnnxRuntime(resources, platform, "x64");

      assert.deepEqual(readdirSync(directory).sort(), [...kept].sort());
      assert.equal(existsSync(join(directory, "..", "arm64")), false);
    });
  });
}
