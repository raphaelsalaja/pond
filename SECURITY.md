# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in `pond`, please report it
responsibly.

**Do not open a public issue.** Instead, use one of the following:

1. **GitHub Private Vulnerability Reporting** (preferred): Go to the
   [Security Advisories](https://github.com/raphaelsalaja/pond/security/advisories/new)
   page and submit a report.
2. **Direct contact**: Reach out to
   [@raphaelsalaja](https://github.com/raphaelsalaja) on GitHub.

## What to Expect

- You will receive an acknowledgment within **48 hours**.
- We will investigate and provide an initial assessment within **7 days**.
- If the vulnerability is accepted, we will work on a fix and coordinate
  disclosure with you.
- If the vulnerability is declined, we will explain why.

## Threat model notes

`pond` is a local-first desktop app. A few things to keep in mind when
deciding whether something is a vulnerability:

- The desktop app exposes a Hono server on `127.0.0.1:41610` only.
  Authentication is a per-install bearer token kept in the OS keychain.
  Reports about the loopback server being reachable from other
  processes on the same machine are valid; reports about it being
  reachable over the network are not — it isn't.
- The browser extension communicates with the desktop app over the
  same loopback channel using the pairing token the user pastes into
  the popup. The token is never sent to a remote server.
- AI enrichment is opt-in and uses a user-supplied AI Gateway key,
  also kept in the keychain. The library content itself never leaves
  the machine.

We appreciate your help in keeping `pond` and its users safe.
