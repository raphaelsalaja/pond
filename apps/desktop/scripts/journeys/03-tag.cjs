/** A opens the tag picker on the selected Save; typing a new name and Enter creates and applies the tag. */
const { select, untilSave } = require("../harness/steps.cjs");

exports.run = async (ctx) => {
  const nightfall = ctx.seed.saves[2];
  await select(ctx, nightfall);
  await ctx.key("a");
  await ctx.waitFor('input[aria-label="Search Tags"]');
  await ctx.type("journey");
  await ctx.waitFor("[data-create]");
  await ctx.key("Enter");
  await untilSave(
    ctx,
    nightfall,
    (save) => (save.tags ?? []).includes("journey"),
    "got the journey tag",
  );
  await ctx.key("Escape");
};
