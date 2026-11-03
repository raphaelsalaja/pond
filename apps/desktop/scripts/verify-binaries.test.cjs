const assert = require("node:assert/strict");
const { mkdir, mkdtemp, rm, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");
const verifyBinaries = require("./verify-binaries.cjs");

function buildContext(appOutDir, electronPlatformName) {
  return {
    appOutDir,
    arch: "x64",
    electronPlatformName,
    packager: {
      appInfo: { productFilename: "Pond" },
      info: { buildResourcesDir: join(appOutDir, "build") },
    },
  };
}

/** Packaging hosts that are not Windows skip the ffmpeg run; the fake keeps both identical. */
function verify(context) {
  return verifyBinaries.verify(context, { runFfmpeg: () => ({ status: 0 }) });
}

async function withTemporaryDirectory(run) {
  const directory = await mkdtemp(join(tmpdir(), "pond-packaging-test-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
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
      }),
      /does not run/,
    );
  });
});
