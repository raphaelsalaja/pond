const { execFileSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const { join, resolve } = require("node:path");

const PLUG_INS = [
  {
    path: "Contents/PlugIns/Pond Extension.appex",
    entitlements: resolve(
      __dirname,
      "../../extension/safari/extension.entitlements",
    ),
  },
  {
    path: "Contents/PlugIns/Pond Share.appex",
    entitlements: resolve(__dirname, "../share-extension/share.entitlements"),
  },
  { path: "Contents/PlugIns/PondDockTile.docktileplugin", entitlements: null },
];

function defaultSign() {
  const builder = require.resolve("electron-builder");
  return require(
    require.resolve("app-builder-lib/out/codeSign/macCodeSign.js", {
      paths: [builder],
    }),
  ).sign;
}

/** electron-builder skips Contents/PlugIns, so each plug-in is signed with its own entitlements before the app seals it. */
exports.default = async function signMac(opts) {
  for (const { path, entitlements } of PLUG_INS) {
    const plugIn = join(opts.app, path);
    if (!existsSync(plugIn) || !opts.identity) continue;
    const args = ["--force", "--sign", opts.identity, "--options", "runtime"];
    if (entitlements) args.push("--entitlements", entitlements);
    if (opts.identity !== "-") args.push("--timestamp");
    if (opts.keychain) args.push("--keychain", opts.keychain);
    execFileSync("codesign", [...args, plugIn], { stdio: "inherit" });
  }
  return defaultSign()(opts);
};
