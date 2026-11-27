const { existsSync } = require("node:fs");
const { mkdtemp, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const WINDOW = { width: 720, height: 440, x: 400, y: 160 };
const ICON_SIZE = 96;
const SECTORS_PER_MB = 2048;
/** LZFSE, readable on macOS 10.11 and later; about a tenth smaller than zlib UDZO for Pond. Matches dmg.format. */
const FORMAT = "ULFO";

exports.default = async function fixDmgWindows(buildResult) {
  if (process.platform !== "darwin") return;
  for (const file of buildResult.artifactPaths) {
    if (file.endsWith(".dmg")) await bakeFinderLayout(file);
  }
};

async function bakeFinderLayout(dmgPath) {
  waitUntilUnmounted();
  const work = await mkdtemp(path.join(tmpdir(), "pond-dmg-"));
  const rw = path.join(work, "rw.dmg");
  const out = path.join(work, path.basename(dmgPath));
  try {
    execFileSync("hdiutil", ["convert", dmgPath, "-format", "UDRW", "-o", rw], {
      stdio: "pipe",
    });
    growScratchSpace(rw);
    const device = attachRw(rw);
    try {
      layoutVolume(waitForVolume());
    } finally {
      detach(device);
      waitUntilUnmounted();
    }
    execFileSync("hdiutil", ["convert", rw, "-format", FORMAT, "-o", out], {
      stdio: "pipe",
    });
    execFileSync("cp", [out, dmgPath]);
    console.log(
      `[pond dmg] baked Finder layout into ${path.basename(dmgPath)}`,
    );
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

function growScratchSpace(image) {
  const limits = execFileSync("hdiutil", ["resize", "-limits", image], {
    encoding: "utf8",
  });
  const parts = limits.trim().split(/\s+/).map(Number);
  const current = parts[1];
  const max = parts[2];
  const wanted = current + 32 * SECTORS_PER_MB;
  const sectors = Math.min(wanted, max);
  execFileSync(
    "hdiutil",
    [
      "resize",
      "-size",
      `${Math.ceil((sectors * 512) / (1024 * 1024))}m`,
      image,
    ],
    { stdio: "pipe" },
  );
}

/**
 * macOS can eject the volume before hdiutil gets to it, which fails with "No such file or
 * directory", or hold it busy for a moment. A vanished device is already detached; a busy one
 * gets a few more tries.
 */
function detach(device) {
  for (let attempt = 1; ; attempt++) {
    try {
      execFileSync("hdiutil", ["detach", device, "-force"], { stdio: "pipe" });
      return;
    } catch (error) {
      if (!existsSync(device)) return;
      if (attempt === 5) throw error;
      execFileSync("sleep", ["1"]);
    }
  }
}

function waitUntilUnmounted() {
  for (const mount of ["/Volumes/Pond", "/Volumes/Pond 1"]) {
    try {
      execFileSync("hdiutil", ["detach", mount, "-quiet"], { stdio: "pipe" });
    } catch {
      /** The volume is usually not mounted, so detach fails. */
    }
  }
  for (let i = 0; i < 20; i++) {
    if (!existsSync("/Volumes/Pond") && !existsSync("/Volumes/Pond 1")) return;
    execFileSync("sleep", ["0.25"]);
  }
}

function attachRw(image) {
  const stdout = execFileSync(
    "hdiutil",
    ["attach", "-readwrite", "-noverify", "-noautoopen", image],
    { encoding: "utf8" },
  );
  const match = stdout.match(/^(\/dev\/disk\d+)/m);
  if (!match) {
    throw new Error(`hdiutil attach produced no device:\n${stdout}`);
  }
  return match[1];
}

function waitForVolume() {
  for (let i = 0; i < 20; i++) {
    if (existsSync("/Volumes/Pond")) return "/Volumes/Pond";
    execFileSync("sleep", ["0.25"]);
  }
  throw new Error("Pond volume did not appear after attach");
}

function layoutVolume(volume) {
  const right = WINDOW.x + WINDOW.width;
  const bottom = WINDOW.y + WINDOW.height;
  const script = `
tell application "Finder"
  tell disk "Pond"
    open
    set current view of container window to icon view
    set toolbar visible of container window to false
    set statusbar visible of container window to false
    try
      set pathbar visible of container window to false
    end try
    set sidebar width of container window to 0
    set the bounds of container window to {${WINDOW.x}, ${WINDOW.y}, ${right}, ${bottom}}
    set opts to icon view options of container window
    set arrangement of opts to not arranged
    set icon size of opts to ${ICON_SIZE}
    try
      set background picture of opts to file ".background.png"
    end try
    update without registering applications
    delay 2
    set the bounds of container window to {${WINDOW.x}, ${WINDOW.y}, ${right}, ${bottom}}
    set statusbar visible of container window to false
    delay 3
    close
  end tell
end tell
`;
  execFileSync("osascript", ["-e", script], { stdio: "pipe" });
  execFileSync("sleep", ["2"]);
  execFileSync("sync", ["-f", volume]);
}
