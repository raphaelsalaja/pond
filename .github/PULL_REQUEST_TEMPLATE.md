<!--
Thanks for contributing to pond! Please fill in the sections below.
Keep PRs focused: one feature or fix per PR.
Layout and proof rules: .github/PULL_REQUESTS.md
If this PR is stacked, start with: > Stacked on #123. Merge that first.
-->

## Summary

<!-- Up to three sentences: what changes for the reader, then why. Link any related issue with `Closes #123`. -->

## Proof

<!--
1. States table, at most four rows, overview first. UI: | State | Light | Dark |. Fix: | State | Before | After |.
   Images in tables: <img src="…" width="400" alt="State, theme">
2. Clip for motion or flows: its URL on its own line under a bold caption.
3. Extra states inside <details><summary>More states</summary> … </details>.
No UI change: a Before/After measurements table. Show each image once.
Replace this section when the UI changes. Don't append updates.
-->

## Changes

<!-- Bullet list of the concrete changes. -->

-
-

## Type of change

- [ ] `feat`: new feature
- [ ] `fix`: bug fix
- [ ] `refactor`: no behavior change
- [ ] `perf`: performance improvement
- [ ] `docs`: documentation only
- [ ] `build` / `ops` / `chore`: tooling, CI, deps
- [ ] Breaking change (note in commit with `!`)

## Areas touched

- [ ] `apps/desktop` (Electron main / preload / renderer)
- [ ] `apps/extension` (WXT extension)
- [ ] `packages/schema` (shared contracts)
- [ ] `packages/icons` or other shared assets
- [ ] CI / release / repo plumbing

## Test plan

<!--
How did you verify this works? At minimum:
- pnpm typecheck
- pnpm lint
Add manual repro steps for the desktop app or extension where relevant.
-->

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] Offline tests pass
- [ ] Manual testing notes:

## Platforms tested

<!--
Check every platform you ran this on. CI builds and smoke-tests all of them,
but only a human can confirm platform-specific behavior. If you touched
platform-specific code (paths, windowing, shortcuts, native modules, packaging),
say what you verified and what you couldn't.
-->

- [ ] macOS
- [ ] Windows
- [ ] Not platform-specific
- Notes:

## Checklist

- [ ] Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
- [ ] Docs/README updated if user-visible behavior changed
- [ ] If this changes the ingest API contract, the extension still works against it
