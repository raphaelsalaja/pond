# Security boundary matrix

Pond stores Library data in plaintext and has no Library password or locked state. The boundaries below protect application access and validate external input.

| Boundary             | Required behavior                                                                                                   | Verification evidence                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Renderer IPC         | Accept trusted senders and validate typed query inputs                                                              | IPC sender and query validation tests            |
| `pond://`            | Resolve media within the permitted Library paths and reject path traversal                                          | Protocol path validation and media storage tests |
| Local HTTP API       | Require the local token and validate requests; retain preview tokens for reviewed mutations                         | HTTP route and operation tests                   |
| MCP                  | Respect configured access capabilities and use reviewed mutation operations                                         | MCP and Agent operation access tests             |
| Agent                | Restrict discoverable operations and review mutations before execution                                              | Agent review and replay-prevention tests         |
| Native host          | Validate framed messages and retain local socket permissions                                                        | Native RPC, framing, and server tests            |
| Auxiliary windows    | Validate the Save before opening, scope control messages to the owning window, and close during Library transitions | Preview-window tests                             |
| Imports              | Validate paths and preserve supported external representations                                                      | Import and package fixtures                      |
| Exports              | Write plaintext packages and files only to the requested export destination                                         | Package and export tests                         |
| Background work      | Stop admission and drain in-flight work before changing the active Library                                          | Library lifecycle, executor, and queue tests     |
| Provider credentials | Keep provider secrets in main and operating system secure storage                                                   | Keychain and provider tests                      |

Run the documented `pnpm check` and `pnpm build` checks. Before signing installers, also run `pnpm --filter @pond/desktop smoke:library-trust`, `pnpm --filter @pond/desktop smoke:offline-release`, and the built desktop smoke using isolated Libraries. The Library trust smoke checks backup manifests and reports password-protected folders in imported Eagle metadata; it does not add folder locking to Pond.
