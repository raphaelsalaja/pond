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
    packager: { appInfo: { productFilename: "Pond" } },
  };
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
  const extensionDirectory = join(resourcesDirectory, "extension");
  await mkdir(binaryDirectory, { recursive: true });
  await mkdir(extensionDirectory, { recursive: true });
  await writeFile(join(binaryDirectory, "ffmpeg.exe"), "binary");
  if (options.nativeHost !== false) {
    await writeFile(join(binaryDirectory, "pond-native-host.exe"), "binary");
  }
  await writeFile(join(extensionDirectory, "manifest.json"), "{}");
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
}

test("uses the executable name required by each packaged platform", () => {
  assert.equal(verifyBinaries.ffmpegName("darwin"), "ffmpeg");
  assert.equal(verifyBinaries.ffmpegName("linux"), "ffmpeg");
  assert.equal(verifyBinaries.ffmpegName("win32"), "ffmpeg.exe");
  assert.equal(verifyBinaries.nativeHostName("darwin"), "pond-native-host");
  assert.equal(verifyBinaries.nativeHostName("win32"), "pond-native-host.exe");
});

test("accepts the Windows ffmpeg executable in the packaged resources", async () => {
  await withTemporaryDirectory(async (appOutDir) => {
    await writeWindowsRuntime(join(appOutDir, "resources"));

    await verifyBinaries.default(buildContext(appOutDir, "win32"));
  });
});

test("rejects a Windows package containing only the Unix ffmpeg name", async () => {
  await withTemporaryDirectory(async (appOutDir) => {
    const binaryDirectory = join(appOutDir, "resources", "bin");
    await writeWindowsRuntime(join(appOutDir, "resources"));
    await rm(join(binaryDirectory, "ffmpeg.exe"));
    await writeFile(join(binaryDirectory, "ffmpeg"), "binary");

    await assert.rejects(
      verifyBinaries.default(buildContext(appOutDir, "win32")),
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
      verifyBinaries.default(buildContext(appOutDir, "win32")),
      /missing bundled pond-native-host.*pond-native-host\.exe/,
    );
  });
});
