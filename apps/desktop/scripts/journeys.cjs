/** Runs each user journey in scripts/journeys against the built desktop app, in file order, in one throwaway Library. */
const { app } = require("electron");
const { existsSync, readdirSync } = require("node:fs");
const { join } = require("node:path");
const {
  createSandbox,
  driver,
  keepOffscreen,
  keepPainting,
  openLibrary,
  seedLibrary,
  within,
} = require("./harness/driver.cjs");

const only = process.argv
  .find((a) => a.startsWith("--only="))
  ?.slice("--only=".length);
const directory = join(__dirname, "journeys");
const files = readdirSync(directory)
  .filter((name) => name.endsWith(".cjs"))
  .filter((name) => !only || name.includes(only))
  .sort();

if (!existsSync(join(__dirname, "../out/main/index.js"))) {
  console.error(
    "journeys: out/main/index.js is missing. Run `pnpm --filter @pond/desktop build` first.",
  );
  process.exit(1);
}
if (files.length === 0) {
  console.error(`journeys: nothing matches --only=${only}`);
  process.exit(1);
}

const sandbox = createSandbox("pond-journeys-");
keepPainting();
app.on("browser-window-created", (_, win) => keepOffscreen(win));

let step = "launch";
const onStep = (name) => {
  step = name;
};
const deadline = setTimeout(
  () => fail(new Error("Timed out after 300000 ms")),
  300000,
);

function fail(error) {
  clearTimeout(deadline);
  console.error(`JOURNEYS_FAILED at ${step}`);
  console.error(error?.stack ?? error);
  app.exit(1);
}

async function main() {
  const win = await openLibrary(sandbox, {
    size: { width: 1440, height: 1000 },
    onStep,
  });
  const ctx = driver(win, { sandbox, onStep });
  step = "seed";
  await seedLibrary(ctx);
  const failed = [];
  for (const file of files) {
    const journey = require(join(directory, file));
    const started = Date.now();
    step = "start";
    try {
      await ctx.key("Escape");
      await ctx.navigate("/");
      await within(60000, journey.run(ctx), file);
      console.log(`JOURNEY_PASSED ${file} ${Date.now() - started}ms`);
    } catch (error) {
      failed.push(file);
      console.error(`JOURNEY_FAILED ${file} at ${step}`);
      console.error(error?.stack ?? error);
    }
  }
  clearTimeout(deadline);
  if (failed.length > 0) {
    console.error(`JOURNEYS_FAILED ${failed.length} of ${files.length}`);
    app.exit(1);
    return;
  }
  console.log(`JOURNEYS_PASSED ${files.length}`);
  app.exit(0);
}

import("../out/main/index.js").catch(fail);
main().catch(fail);
