# Repository instructions

Before changing code, read [CONTRIBUTING.md](docs/CONTRIBUTING.md) and [code standards](docs/contributing/code-standards.md).

For PR bodies, screenshots, and clips, read [pull requests](docs/contributing/pull-requests.md).

For module moves, state ownership, or main/preload/renderer interfaces, read [desktop architecture](docs/contributing/architecture.md). For domain naming, read [domain context](docs/context.md). For UI behavior, read [design principles](apps/desktop/src/renderer/src/PRINCIPLES.md).

## Shared development runtime

Long-running development and watch processes are shared, user-owned infrastructure.

- Only a chat explicitly designated by the user as the runtime owner may run `pnpm dev`, `pnpm dev:desktop`, `turbo run dev`, or another watch command.
- Assume the development runtime is already running. Use finite checks such as lint, typecheck, test, and build in every other chat.
- If runtime verification is needed, use the existing runtime or tell the user what must be checked. Do not launch another server.
- Use the current development runtime for UI checks. Only open a `dist` build after rebuilding it from the latest working-tree changes.
- Worktree chats must not start a separate runtime. Runtime verification happens from the designated shared checkout.

Use the same documented checks as human contributors. Preserve unrelated working changes. Keep live-network tests separate from offline verification.
