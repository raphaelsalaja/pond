/** Opens the Library, then the command menu with Mod+K, as a stills-and-clip proof of the capture tool. */
exports.run = async (ctx) => {
  await ctx.navigate("/");
  await ctx.waitFor(() =>
    ctx.eval(
      `[...document.querySelectorAll("img")].filter((img) => img.complete && img.naturalWidth > 0).length >= ${ctx.seed.saves.length}`,
    ),
  );
  await ctx.wait(500);
  await ctx.shot("library");
  await ctx.record("command-menu", async () => {
    await ctx.wait(700);
    await ctx.key("Mod+K");
    await ctx.waitFor('[aria-label="Search Pond"]');
    await ctx.wait(700);
    await ctx.type("Tide");
    await ctx.wait(1400);
  });
  await ctx.shot("command-menu", { pair: "library" });
};
