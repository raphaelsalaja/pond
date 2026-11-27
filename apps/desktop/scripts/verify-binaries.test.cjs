const assert = require("node:assert/strict");
const { existsSync, readdirSync } = require("node:fs");
const { mkdir, mkdtemp, rm, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const test = require("node:test");
const verifyBinaries = require("./verify-binaries.cjs");

function buildContext(appOutDir, electronPlatformName, arch = "x64") {
  return {
    appOutDir,
    arch,
    electronPlatformName,
    packager: {
      appInfo: { productFilename: "Pond" },
      info: { buildResourcesDir: path.join(appOutDir, "build") },
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
    runBinaryVersion: () => ({ status: 0 }),
    runOnnx: () => ({ status: 0 }),
    readArchs: () => slices,
  });
}

async function withTemporaryDirectory(run) {
  const directory = await mkdtemp(path.join(tmpdir(), "pond-packaging-test-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function writeTintIcon(resourcesDirectory) {
  const tint = path.join(resourcesDirectory, "app-icons", "aqua");
  await mkdir(tint, { recursive: true });
  await writeFile(path.join(tint, "default.png"), "binary");
}

async function writeWindowsRuntime(resourcesDirectory, options = {}) {
  const binaryDirectory = path.join(resourcesDirectory, "bin");
  await mkdir(binaryDirectory, { recursive: true });
  await writeFile(path.join(binaryDirectory, "ffmpeg.exe"), "binary");
  await writeFile(path.join(binaryDirectory, "ffprobe.exe"), "binary");
  if (options.nativeHost !== false) {
    await writeFile(
      path.join(binaryDirectory, "pond-native-host.exe"),
      "binary",
    );
  }
  await mkdir(
    path.join(
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
  await mkdir(path.join(sqliteVec, ".."), { recursive: true });
  await writeFile(sqliteVec, "binary");
  if (options.sharp !== false) {
    const lib = path.join(
      resourcesDirectory,
      "app.asar.unpacked/node_modules/@img/sharp-win32-x64/lib",
    );
    await mkdir(lib, { recursive: true });
    await writeFile(path.join(lib, "sharp-win32-x64.node"), "binary");
    await writeFile(path.join(lib, "libvips-42.dll"), "binary");
  }
  if (options.onnx !== false) {
    const bin = path.join(
      resourcesDirectory,
      "app.asar.unpacked/node_modules/onnxruntime-node/bin/napi-v6/win32/x64",
    );
    await mkdir(bin, { recursive: true });
    await writeFile(path.join(bin, "onnxruntime_binding.node"), "binary");
    await writeFile(path.join(bin, "onnxruntime.dll"), "binary");
  }
  if (options.tints !== false) await writeTintIcon(resourcesDirectory);
  if (options.icon !== false) {
    const build = path.join(resourcesDirectory, "..", "build");
    await mkdir(build, { recursive: true });
    await writeFile(path.join(build, "icon.png"), "binary");
  }
}

void test("uses the executable name required by each packaged platform", () => {
  assert.equal(verifyBinaries.ffmpegName("darwin"), "ffmpeg");
  assert.equal(verifyBinaries.ffmpegName("linux"), "ffmpeg");
  assert.equal(verifyBinaries.ffmpegName("win32"), "ffmpeg.exe");
  assert.equal(verifyBinaries.nativeHostName("darwin"), "pond-native-host");
  assert.equal(verifyBinaries.nativeHostName("linux"), "pond-native-host");
  assert.equal(verifyBinaries.nativeHostName("win32"), "pond-native-host.exe");
});

void test("accepts the Windows ffmpeg executable in the packaged resources", async () => {
  await withTemporaryDirectory(async (appOutDir) => {
    await writeWindowsRuntime(path.join(appOutDir, "resources"));

    await verify(buildContext(appOutDir, "win32"));
  });
});

void test("rejects a Windows package containing only the Unix ffmpeg name", async () => {
  await withTemporaryDirectory(async (appOutDir) => {
    const binaryDirectory = path.join(appOutDir, "resources", "bin");
    await writeWindowsRuntime(path.join(appOutDir, "resources"));
    await rm(path.join(binaryDirectory, "ffmpeg.exe"));
    await writeFile(path.join(binaryDirectory, "ffmpeg"), "binary");

    await assert.rejects(
      verify(buildContext(appOutDir, "win32")),
      /missing bundled ffmpeg.*ffmpeg\.exe/,
    );
  });
});

void test("rejects a Windows package without its native-host executable", async () => {
  await withTemporaryDirectory(async (appOutDir) => {
    await writeWindowsRuntime(path.join(appOutDir, "resources"), {
      nativeHost: false,
    });

    await assert.rejects(
      verify(buildContext(appOutDir, "win32")),
      /missing bundled pond-native-host.*pond-native-host\.exe/,
    );
  });
});

void test("rejects a Windows package without the sharp runtime", async () => {
  await withTemporaryDirectory(async (appOutDir) => {
    await writeWindowsRuntime(path.join(appOutDir, "resources"), {
      sharp: false,
    });

    await assert.rejects(
      verify(buildContext(appOutDir, "win32")),
      /missing sharp win32-x64 runtime/,
    );
  });
});

void test("rejects a Windows package without the onnxruntime libraries", async () => {
  await withTemporaryDirectory(async (appOutDir) => {
    await writeWindowsRuntime(path.join(appOutDir, "resources"), {
      onnx: false,
    });

    await assert.rejects(
      verify(buildContext(appOutDir, "win32")),
      /missing bundled onnxruntime onnxruntime_binding.node/,
    );
  });
});

void test("rejects a Windows package built without the app icon", async () => {
  await withTemporaryDirectory(async (appOutDir) => {
    await writeWindowsRuntime(path.join(appOutDir, "resources"), {
      icon: false,
    });

    await assert.rejects(
      verify(buildContext(appOutDir, "win32")),
      /missing app icon/,
    );
  });
});

void test("rejects a package without the tint icons", async () => {
  await withTemporaryDirectory(async (appOutDir) => {
    await writeWindowsRuntime(path.join(appOutDir, "resources"), {
      tints: false,
    });

    await assert.rejects(
      verify(buildContext(appOutDir, "win32")),
      /no tint icons/,
    );
  });
});

async function writeMacRuntime(resourcesDirectory, arch, options = {}) {
  const binaryDirectory = path.join(resourcesDirectory, "bin");
  await mkdir(binaryDirectory, { recursive: true });
  await writeFile(path.join(binaryDirectory, "ffmpeg"), "binary");
  await writeFile(path.join(binaryDirectory, "ffprobe"), "binary");
  await writeFile(path.join(binaryDirectory, "pond-native-host"), "binary");
  await mkdir(
    path.join(
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
  await mkdir(path.join(sqliteVec, ".."), { recursive: true });
  await writeFile(sqliteVec, "binary");
  const sharpDir = path.join(
    resourcesDirectory,
    `app.asar.unpacked/node_modules/@img/sharp-darwin-${arch}/lib`,
  );
  await mkdir(sharpDir, { recursive: true });
  await writeFile(path.join(sharpDir, `sharp-darwin-${arch}.node`), "binary");
  const libvipsDir = path.join(
    resourcesDirectory,
    `app.asar.unpacked/node_modules/@img/sharp-libvips-darwin-${arch}/lib`,
  );
  await mkdir(libvipsDir, { recursive: true });
  await writeFile(path.join(libvipsDir, "libvips.dylib"), "binary");
  if (arch === "arm64") {
    const onnxDir = path.join(
      resourcesDirectory,
      "app.asar.unpacked/node_modules/onnxruntime-node/bin/napi-v6/darwin/arm64",
    );
    await mkdir(onnxDir, { recursive: true });
    await writeFile(path.join(onnxDir, "onnxruntime_binding.node"), "binary");
    await writeFile(path.join(onnxDir, "libonnxruntime.1.dylib"), "binary");
  }
  await writeTintIcon(resourcesDirectory);
  await writePostRenderer(resourcesDirectory, options.renderer);
  if (options.catalog !== false) {
    await writeFile(
      path.join(resourcesDirectory, "Assets.car"),
      options.catalog ?? "binary",
    );
  }
}

const RENDER_FONTS = [
  "Inter-Regular.otf",
  "Inter-Medium.otf",
  "Inter-SemiBold.otf",
  "Inter-Bold.otf",
  "OFL.txt",
  "NotoSans-Regular.ttf",
  "STIXTwoMath-Regular.otf",
];

async function writePostRenderer(resourcesDirectory, renderer = {}) {
  if (renderer === false) return;
  const fontsDirectory = path.join(resourcesDirectory, "render", "fonts");
  await mkdir(fontsDirectory, { recursive: true });
  await writeFile(
    path.join(resourcesDirectory, "render", "pond-render.wasm"),
    renderer.wasm ?? Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00]),
  );
  for (const font of RENDER_FONTS) {
    if (renderer.omit === font) continue;
    await writeFile(path.join(fontsDirectory, font), "font");
  }
}

for (const arch of ["arm64", "x64"]) {
  void test(`accepts a macOS ${arch} package with the Icon Composer catalog`, async () => {
    await withTemporaryDirectory(async (appOutDir) => {
      const resources = path.join(
        appOutDir,
        "Pond.app",
        "Contents",
        "Resources",
      );
      await writeMacRuntime(resources, arch);

      await verify(buildContext(appOutDir, "darwin", arch));
    });
  });

  void test(`rejects a macOS ${arch} package without the Icon Composer catalog`, async () => {
    await withTemporaryDirectory(async (appOutDir) => {
      const resources = path.join(
        appOutDir,
        "Pond.app",
        "Contents",
        "Resources",
      );
      await writeMacRuntime(resources, arch, { catalog: false });

      await assert.rejects(
        verify(buildContext(appOutDir, "darwin", arch)),
        /missing .*Assets\.car/,
      );
    });
  });
}

void test("rejects a macOS package with an empty Icon Composer catalog", async () => {
  await withTemporaryDirectory(async (appOutDir) => {
    const resources = path.join(appOutDir, "Pond.app", "Contents", "Resources");
    await writeMacRuntime(resources, "arm64", { catalog: "" });

    await assert.rejects(
      verify(buildContext(appOutDir, "darwin", "arm64")),
      /Assets\.car is empty/,
    );
  });
});

async function writeLinuxRuntime(resourcesDirectory, options = {}) {
  const binaryDirectory = path.join(resourcesDirectory, "bin");
  await mkdir(binaryDirectory, { recursive: true });
  await writeFile(path.join(binaryDirectory, "ffmpeg"), "binary");
  await writeFile(path.join(binaryDirectory, "ffprobe"), "binary");
  if (options.nativeHost !== false) {
    await writeFile(path.join(binaryDirectory, "pond-native-host"), "binary");
  }
  await mkdir(
    path.join(
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
  await mkdir(path.join(sqliteVec, ".."), { recursive: true });
  await writeFile(sqliteVec, "binary");
  if (options.sharp !== false) {
    const sharp = path.join(
      resourcesDirectory,
      "app.asar.unpacked/node_modules/@img/sharp-linux-x64/lib",
    );
    await mkdir(sharp, { recursive: true });
    await writeFile(path.join(sharp, "sharp-linux-x64.node"), "binary");
    const libvips = path.join(
      resourcesDirectory,
      "app.asar.unpacked/node_modules/@img/sharp-libvips-linux-x64/lib",
    );
    await mkdir(libvips, { recursive: true });
    await writeFile(path.join(libvips, "libvips-cpp.so.8.18.6"), "binary");
  }
  if (options.onnx !== false) {
    const bin = path.join(
      resourcesDirectory,
      "app.asar.unpacked/node_modules/onnxruntime-node/bin/napi-v6/linux/x64",
    );
    await mkdir(bin, { recursive: true });
    await writeFile(path.join(bin, "onnxruntime_binding.node"), "binary");
    await writeFile(path.join(bin, "libonnxruntime.so.1"), "binary");
  }
  await writeTintIcon(resourcesDirectory);
  const build = path.join(resourcesDirectory, "..", "build");
  await mkdir(build, { recursive: true });
  await writeFile(path.join(build, "icon.png"), "binary");
}

void test("accepts a Linux package with every native runtime", async () => {
  await withTemporaryDirectory(async (appOutDir) => {
    await writeLinuxRuntime(path.join(appOutDir, "resources"));

    await verify(buildContext(appOutDir, "linux"));
  });
});

void test("rejects a Linux package without its native-host executable", async () => {
  await withTemporaryDirectory(async (appOutDir) => {
    await writeLinuxRuntime(path.join(appOutDir, "resources"), {
      nativeHost: false,
    });

    await assert.rejects(
      verify(buildContext(appOutDir, "linux")),
      /missing bundled pond-native-host/,
    );
  });
});

void test("rejects a Linux package without the sharp runtime", async () => {
  await withTemporaryDirectory(async (appOutDir) => {
    await writeLinuxRuntime(path.join(appOutDir, "resources"), {
      sharp: false,
    });

    await assert.rejects(
      verify(buildContext(appOutDir, "linux")),
      /missing sharp linux-x64 runtime/,
    );
  });
});

void test("rejects a Linux package without the onnxruntime libraries", async () => {
  await withTemporaryDirectory(async (appOutDir) => {
    await writeLinuxRuntime(path.join(appOutDir, "resources"), { onnx: false });

    await assert.rejects(
      verify(buildContext(appOutDir, "linux")),
      /missing bundled onnxruntime/,
    );
  });
});

void test(
  "rejects a bundled ffmpeg that does not run",
  {
    skip: process.platform !== "win32",
  },
  async () => {
    await withTemporaryDirectory(async (appOutDir) => {
      await writeWindowsRuntime(path.join(appOutDir, "resources"));

      await assert.rejects(
        verifyBinaries.verify(buildContext(appOutDir, "win32"), {
          runBinaryVersion: () => ({ status: 1 }),
          runOnnx: () => ({ status: 0 }),
        }),
        /does not run/,
      );
    });
  },
);

const hostPlatform =
  process.platform === "win32" || process.platform === "linux"
    ? process.platform
    : null;

void test(
  "rejects an onnxruntime that cannot run a CPU session",
  {
    skip: !hostPlatform || process.arch !== "x64",
  },
  async () => {
    await withTemporaryDirectory(async (appOutDir) => {
      const resources = path.join(appOutDir, "resources");
      if (hostPlatform === "win32") {
        await writeWindowsRuntime(resources);
      } else {
        await writeLinuxRuntime(resources);
      }

      await assert.rejects(
        verifyBinaries.verify(buildContext(appOutDir, hostPlatform), {
          runBinaryVersion: () => ({ status: 0 }),
          runOnnx: () => ({ status: 1, stderr: "missing DirectML.dll" }),
        }),
        /cannot run a CPU session/,
      );
    });
  },
);

async function writeOnnxFiles(resourcesDirectory, platform, arch, files) {
  const directory = path.join(
    resourcesDirectory,
    "app.asar.unpacked/node_modules/onnxruntime-node/bin/napi-v6",
    platform,
    arch,
  );
  await mkdir(directory, { recursive: true });
  for (const file of files) {
    await writeFile(path.join(directory, file), "binary");
  }
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
  void test(`prunes onnxruntime libraries a ${platform} CPU session never loads`, async () => {
    await withTemporaryDirectory(async (resources) => {
      const directory = await writeOnnxFiles(resources, platform, "x64", [
        ...Array.from(kept),
        ...Array.from(pruned),
      ]);
      await writeOnnxFiles(resources, platform, "arm64", kept);

      verifyBinaries.pruneOnnxRuntime(resources, platform, "x64");

      assert.deepEqual(readdirSync(directory).sort(), Array.from(kept).sort());
      assert.equal(existsSync(path.join(directory, "..", "arm64")), false);
    });
  });
}

void test("rejects a macOS package without the post renderer", async () => {
  await withTemporaryDirectory(async (appOutDir) => {
    const resources = path.join(appOutDir, "Pond.app", "Contents", "Resources");
    await writeMacRuntime(resources, "arm64", { renderer: false });

    await assert.rejects(
      verify(buildContext(appOutDir, "darwin", "arm64")),
      /missing post renderer at .*pond-render\.wasm/,
    );
  });
});

void test("rejects a macOS package whose post renderer is not WebAssembly", async () => {
  await withTemporaryDirectory(async (appOutDir) => {
    const resources = path.join(appOutDir, "Pond.app", "Contents", "Resources");
    await writeMacRuntime(resources, "arm64", { renderer: { wasm: "" } });

    await assert.rejects(
      verify(buildContext(appOutDir, "darwin", "arm64")),
      /pond-render\.wasm is not a WebAssembly module/,
    );
  });
});

for (const font of [
  "Inter-Bold.otf",
  "NotoSans-Regular.ttf",
  "STIXTwoMath-Regular.otf",
]) {
  void test(`rejects a macOS package whose post renderer lacks ${font}`, async () => {
    await withTemporaryDirectory(async (appOutDir) => {
      const resources = path.join(
        appOutDir,
        "Pond.app",
        "Contents",
        "Resources",
      );
      await writeMacRuntime(resources, "arm64", { renderer: { omit: font } });

      await assert.rejects(
        verify(buildContext(appOutDir, "darwin", "arm64")),
        /post renderer fonts .* are missing/,
      );
    });
  });
}
