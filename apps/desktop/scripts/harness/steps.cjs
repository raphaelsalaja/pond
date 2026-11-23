/** User-level steps shared by the journeys in scripts/journeys. */
const card = (id) => `[data-library-card][data-save-id="${id}"]`;

/** A click selects a card and hands the grid keyboard ownership, which Enter, Backspace, A and Alt+F need. */
async function select(ctx, id) {
  await ctx.click(`${card(id)} [role="option"]`);
  await ctx.waitFor(`${card(id)}[data-selected="true"]`);
}

/** Polls a Save over IPC until `check` passes, so a journey proves the data changed and not only the DOM. */
async function untilSave(ctx, id, check, what) {
  try {
    return await ctx.waitFor(async () => {
      const save = await ctx.query("saves.get", { id });
      return check(save) ? save : null;
    });
  } catch {
    throw new Error(`Save ${id} never ${what}`);
  }
}

module.exports = { card, select, untilSave };
