/** Mod+Alt+N creates and selects a note; opening it and typing saves the text. */
const { select, untilSave } = require("../harness/steps.cjs");

exports.run = async (ctx) => {
  const seeded = new Set(ctx.seed.saves);
  await ctx.key("Mod+Alt+N");
  const note = await ctx.waitFor(async () => {
    const id = await ctx.eval(
      `document.querySelector('[data-library-card][data-selected="true"]')?.dataset.saveId ?? null`,
    );
    return id && !seeded.has(id) ? id : null;
  });
  await untilSave(
    ctx,
    note,
    (save) => save.mediaType === "text",
    "became a note",
  );
  await select(ctx, note);
  await ctx.key("Enter");
  await ctx.click('[data-save-details] [aria-label="Note"]');
  await ctx.type("Tide tables");
  await untilSave(
    ctx,
    note,
    (save) => save.description?.includes("Tide tables"),
    "saved its text",
  );
  await ctx.key("Escape");
};
