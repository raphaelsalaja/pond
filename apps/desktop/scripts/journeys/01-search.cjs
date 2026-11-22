/** Mod+K, type part of a title, Enter opens that Save, Escape goes back to the Library. */
exports.run = async (ctx) => {
  await ctx.key("Mod+K");
  await ctx.waitFor('input[role="combobox"][aria-label="Search Pond"]');
  await ctx.type("Tide");
  await ctx.waitFor(() =>
    ctx.eval(
      `document.querySelector('#pond-command-menu-results [role="option"][data-command-index="0"]')?.textContent.includes("Tidepool")`,
    ),
  );
  await ctx.key("Enter");
  await ctx.waitFor('[data-save-details][aria-label="Tidepool"]');
  await ctx.key("Escape");
  await ctx.waitFor(() =>
    ctx.eval(`!document.querySelector("[data-save-details]")`),
  );
};
