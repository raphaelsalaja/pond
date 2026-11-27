const fs = require("node:fs");
const path = require("node:path");

/** Built by `pnpm --filter @pond/core build`; absent until then, so callers check `nativeCore` before using it. */
const binary = path.join(
  __dirname,
  `pond-core.${process.platform}-${process.arch}.node`,
);

module.exports = { nativeCore: fs.existsSync(binary) ? require(binary) : null };
