<!--
Thanks for contributing to pond! Please fill in the sections below.
Keep PRs focused: one feature or fix per PR.
-->

## Summary

<!-- What does this PR do, and why? Link any related issue with `Closes #123`. -->

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
- [ ] `pnpm lint` and `pnpm oxlint` pass
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
