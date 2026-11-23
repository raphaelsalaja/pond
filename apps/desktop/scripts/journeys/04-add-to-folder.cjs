/** Alt+F opens the folder picker on the selected Save; filtering to a folder and Enter adds the Save to it. */
const { select } = require("../harness/steps.cjs");

exports.run = async (ctx) => {
  const glacier = ctx.seed.saves[5];
  const moodboard = ctx.seed.folders[0];
  await select(ctx, glacier);
  await ctx.key("Alt+F");
  await ctx.waitFor('input[aria-label="Search Folders"]');
  await ctx.type("Moodboard");
  await ctx.key("Enter");
  await ctx.waitFor(async () => {
    const memberships = await ctx.query("folders.memberships", {});
    return memberships.some(
      (row) => row.saveId === glacier && row.folderId === moodboard.id,
    );
  });
  await ctx.key("Escape");
};
