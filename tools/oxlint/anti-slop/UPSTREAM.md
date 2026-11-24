# Upstream

- Source: [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop)
- Commit: `63dbb09f73438e550a6991dc6d778f979ffbf183`
- Copied: `src/index.ts`, `src/rules/*.ts` (tests excluded), `src/shared/`, `src/vendor/`, `LICENSE`
- Not copied: `src/effect/` (Pond does not use Effect)

## Deviations

None in the source. `oxlint.config.ts` enables only the rules `@cloudflare/oxlint-config` does not already cover through its `quality` plugin: `no-module-mocking`, `no-runtime-typeof`, `no-shape-in-symbol-names`, `no-unknown-parameters`, and `require-safety-comment-for-type-assertion`.
