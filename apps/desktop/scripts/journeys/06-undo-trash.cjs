/** Undo right after Move to Trash restores the Save. */
const { card, select, untilSave } = require("../harness/steps.cjs");

exports.run = async (ctx) => {
  const moss = ctx.seed.saves[4];
  await select(ctx, moss);
  await ctx.key("Backspace");
  await untilSave(ctx, moss, (save) => save.deletedAt != null, "moved to Trash");
  /** Edit > Undo is a native menu accelerator that needs a focused window, so call what it sends. */
  await ctx.eval("window.pond.undo()");
  await untilSave(ctx, moss, (save) => save.deletedAt == null, "came back");
  await ctx.waitFor(card(moss));
};
