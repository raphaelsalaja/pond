import { createHash } from "node:crypto";
import { createReadStream, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

const [version, armPath, intelPath, caskPath = "Casks/pond.rb"] =
  process.argv.slice(2);

if (!version || !armPath || !intelPath || !/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(
    "Usage: node scripts/update-homebrew-cask.mjs <version> <arm-dmg> <intel-dmg> [cask]",
  );
}

const expectedArm = `Pond-${version}-arm64.dmg`;
const expectedIntel = `Pond-${version}-x64.dmg`;

if (
  basename(armPath) !== expectedArm ||
  basename(intelPath) !== expectedIntel
) {
  throw new Error(
    `Expected ${expectedArm} and ${expectedIntel} release artifacts`,
  );
}

function sha256(path) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

const [armSha, intelSha] = await Promise.all([
  sha256(armPath),
  sha256(intelPath),
]);

const current = readFileSync(caskPath, "utf8");
const updated = current
  .replace(/version "\d+\.\d+\.\d+"/, `version "${version}"`)
  .replace(
    /sha256 arm:\s+"[a-f0-9]{64}",\n\s+intel: "[a-f0-9]{64}"/,
    `sha256 arm:   "${armSha}",\n         intel: "${intelSha}"`,
  );

if (
  !updated.includes(`version "${version}"`) ||
  !updated.includes(`sha256 arm:   "${armSha}"`) ||
  !updated.includes(`intel: "${intelSha}"`)
) {
  throw new Error(`Could not update ${caskPath}`);
}

if (updated !== current) writeFileSync(caskPath, updated);
