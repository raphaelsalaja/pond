/** Backspace moves the selected Save to Trash; selecting it in Trash and Restore from Trash brings it back. */
const { select, untilSave } = require("../harness/steps.cjs");

exports.run = async (ctx) => {
  const coral = ctx.seed.saves[3];
  await select(ctx, coral);
  await ctx.key("Backspace");
  await untilSave(
    ctx,
    coral,
    (save) => save.deletedAt != null,
    "moved to Trash",
  );
  await ctx.navigate("/trash");
  await select(ctx, coral);
  await ctx.click('button[aria-label="Restore from Trash"]');
  await untilSave(ctx, coral, (save) => save.deletedAt == null, "came back");
};
