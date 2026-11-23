/** Compiles a Swift app extension into a universal, ad-hoc signed `.appex`; `sign-mac.cjs` re-signs it for release. */

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
/** Matches the Safari appex in `build-safari-extension.mjs`. */
const DEPLOYMENT_TARGET = "13.5";
const ARCHS = ["arm64", "x86_64"];

/** The appex must carry the host app's bundle ID as its prefix, so read it from `appId`. */
function appBundleId(fail) {
  const yml = readFileSync(
    resolve(desktopRoot, "electron-builder.yml"),
    "utf8",
  );
  const match = yml.match(/^appId:\s*(\S+)\s*$/m);
  if (!match) fail("electron-builder.yml has no top-level appId");
  return match[1];
}

export function buildAppex({
  tag,
  kind,
  module,
  name,
  source,
  sources,
  entitlements,
  bundleSuffix,
  output,
}) {
  const skip = (reason) => {
    console.log(`[pond ${tag}] skipped: ${reason}`);
    process.exit(0);
  };
  const fail = (message) => {
    console.error(`[pond ${tag}] ${message}`);
    process.exit(1);
  };
  const run = (command, args) => {
    const result = spawnSync(command, args, { stdio: "inherit" });
    if (result.error || result.status !== 0) {
      fail(`${command} ${args.join(" ")} failed`);
    }
  };

  if (process.platform !== "darwin") skip(`${kind} are macOS only`);
  const swiftc = spawnSync("xcrun", ["--find", "swiftc"], {
    encoding: "utf8",
  });
  if (swiftc.error || swiftc.status !== 0) {
    if (process.env.CI) fail(`swiftc is required to build the ${kind}`);
    skip("swiftc is not installed");
  }

  const sourceDir = resolve(desktopRoot, source);
  const workDir = resolve(desktopRoot, ".appex-build", module);
  const appex = resolve(desktopRoot, output, `${name}.appex`);
  const version = JSON.parse(
    readFileSync(resolve(desktopRoot, "package.json"), "utf8"),
  ).version;

  rmSync(workDir, { recursive: true, force: true });
  rmSync(appex, { recursive: true, force: true });
  mkdirSync(workDir, { recursive: true });
  mkdirSync(join(appex, "Contents/MacOS"), { recursive: true });

  const slices = ARCHS.map((arch) => {
    const out = join(workDir, `${module}-${arch}`);
    run("xcrun", [
      "swiftc",
      "-O",
      "-parse-as-library",
      "-application-extension",
      "-module-name",
      module,
      "-target",
      `${arch}-apple-macos${DEPLOYMENT_TARGET}`,
      "-framework",
      "AppKit",
      "-Xlinker",
      "-e",
      "-Xlinker",
      "_NSExtensionMain",
      ...sources.map((file) => join(sourceDir, file)),
      "-o",
      out,
    ]);
    return out;
  });
  run("xcrun", [
    "lipo",
    "-create",
    ...slices,
    "-output",
    join(appex, "Contents/MacOS", module),
  ]);

  const plist = readFileSync(join(sourceDir, "Info.plist"), "utf8")
    .replaceAll("__BUNDLE_ID__", `${appBundleId(fail)}.${bundleSuffix}`)
    .replaceAll("__VERSION__", version);
  writeFileSync(join(appex, "Contents/Info.plist"), plist);

  run("codesign", [
    "--force",
    "--sign",
    "-",
    "--options",
    "runtime",
    "--entitlements",
    join(sourceDir, entitlements),
    appex,
  ]);
  console.log(`[pond ${tag}] built ${appex}`);
}
