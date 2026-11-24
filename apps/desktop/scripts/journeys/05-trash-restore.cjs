/** Backspace moves the selected Save to Trash; in Trash, Backspace on it restores it. */
const { select, untilSave } = require("../harness/steps.cjs");

exports.run = async (ctx) => {
  const coral = ctx.seed.saves[3];
  await select(ctx, coral);
  await ctx.key("Backspace");
  await untilSave(
    ctx,
    coral,
    (save) => save.deletedAt !== null && save.deletedAt !== undefined,
    "moved to Trash",
  );
  await ctx.navigate("/trash");
  await select(ctx, coral);
  await ctx.key("Backspace");
  await untilSave(
    ctx,
    coral,
    (save) => save.deletedAt === null || save.deletedAt === undefined,
    "came back",
  );
};
