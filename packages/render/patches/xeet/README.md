# xeet patches

Pond renders posts with a WebAssembly build of [xeet](https://github.com/rauchg/xeet) (Apache-2.0). These patches are Pond's changes to it. `scripts/fetch-xeet.mjs` checks out upstream at the `rev` in `../../xeet.json` and applies them in order with `git am`. The result must match the `tree` that file pins.

- `0001` adds font stacks, faces the host registers from font collections, and extra font and icon manifests, so Bluesky and Threads layouts can use fonts other than X's.
- `0002` builds variable-font instances from the manifest's axes, and outside X it uses the font's own emoji advance.

To change them, edit a checkout of upstream at that rev with these commits applied, then regenerate the patches with `git format-patch -o packages/render/patches/xeet <rev>..HEAD`. Update `tree` in `xeet.json` to `git rev-parse HEAD^{tree}`.
