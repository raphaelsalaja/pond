/** Click a card to select it, Enter opens it, Escape returns to the same card. */
const { card, select } = require("../harness/steps.cjs");

exports.run = async (ctx) => {
  const dune = ctx.seed.saves[1];
  await select(ctx, dune);
  await ctx.key("Enter");
  await ctx.waitFor('[data-save-details][aria-label="Dune"]');
  await ctx.key("Escape");
  await ctx.waitFor(card(dune));
};
