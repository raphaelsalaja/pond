/** Undo right after Move to Trash restores the Save. */
const assert = require("node:assert/strict");
const { card, select, untilSave } = require("../harness/steps.cjs");

const DISMISS = '[data-slot="toasts"] button[aria-label="Dismiss"]';

exports.run = async (ctx) => {
  const moss = ctx.seed.saves[4];
  /** Earlier journeys leave Undo toasts open, so clear them before waiting for this one. */
  await ctx.eval(
    `document.querySelectorAll('${DISMISS}').forEach((button) => button.click())`,
  );
  await ctx.waitFor(() => ctx.eval(`!document.querySelector('${DISMISS}')`));
  await select(ctx, moss);
  await ctx.key("Backspace");
  await untilSave(
    ctx,
    moss,
    (save) => save.deletedAt !== null && save.deletedAt !== undefined,
    "moved to Trash",
  );
  /** The index shows the Trash before main records its Undo step, and the toast's Undo appears only after. */
  await ctx.waitFor(() =>
    ctx.eval(
      `[...document.querySelectorAll('[data-slot="toasts"] button')].some((button) => button.textContent.trim() === "Undo")`,
    ),
  );
  /** Edit > Undo is a native menu accelerator that needs a focused window, so call what it sends. */
  const undone = await ctx.eval("window.pond.undo()");
  assert.ok(undone.ok, `Undo failed: ${JSON.stringify(undone)}`);
  await untilSave(
    ctx,
    moss,
    (save) => save.deletedAt === null || save.deletedAt === undefined,
    `came back after ${JSON.stringify(undone)}`,
  );
  await ctx.waitFor(card(moss));
};
