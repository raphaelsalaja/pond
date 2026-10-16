> The web is a sea of information. Everyone deserves their own pond.

## Install

### macOS

Download the latest `.dmg` from [GitHub Releases](https://github.com/raphaelsalaja/pond/releases), or install it with Homebrew:

```bash
brew tap raphaelsalaja/pond https://github.com/raphaelsalaja/pond
brew install --cask raphaelsalaja/pond/pond
```

Pond needs macOS 13 or later, on Apple Silicon or Intel. It's signed and notarized, and it updates itself from GitHub Releases.

### Windows

Download `Pond-X.Y.Z-x64.exe` from [GitHub Releases](https://github.com/raphaelsalaja/pond/releases) and run it. The installer sets Pond up for your user account and does not need administrator rights. Pond needs 64-bit Windows 10 or 11 on x64, and it updates itself from GitHub Releases.

The installer is not code-signed yet, so Windows SmartScreen may show "Windows protected your PC" on first run. Choose **More info**, then **Run anyway**. Windows on Arm is not built yet.

Linux is on the [roadmap](ROADMAP.md).

### Browser extension

Saving from the web and connecting accounts in Sources both need the Pond extension. It works in Chrome, Brave, and Edge on macOS and Windows, and in Arc on macOS.

1. In Pond, open the library menu at the top of the sidebar, choose **Browser Extension**, then click **Download**. A Pond Extension folder lands in Downloads. You can also download `pond-extension-X.Y.Z.zip` from the release, or build it from source with [`apps/extension/README.md`](apps/extension/README.md).
2. Open `chrome://extensions`, turn on Developer mode, click **Load unpacked**, and choose the folder.
3. Click the Pond icon or right-click a page to save. Pond must have opened once so the extension can reach it.

### Raycast extension

The Raycast extension searches your active Library, saves URLs, opens Saves,
and switches recent Libraries. See
[`apps/raycast/README.md`](apps/raycast/README.md) for setup.

### CLI

Install the local automation client from npm:

```bash
npm install --global @pond/cli
pond auth authorize --token <token>
pond doctor
```

Copy the Local API token from Pond Settings. The CLI launches Pond when needed
and sends every Library operation through the authenticated loopback service.
Run `pond --help` for commands and output formats.

## Development

Requires Node.js 24 (see `.nvmrc`) and pnpm 11.27.0. On Windows, see [Windows development](CONTRIBUTING.md#windows-development) for the extra prerequisites.

```bash
pnpm install
pnpm dev
```

Extension dev (separate terminal):

```bash
pnpm --filter @pond/extension dev
```

Raycast extension dev (separate terminal):

```bash
pnpm --dir apps/raycast develop
```

CLI development:

```bash
pnpm cli -- --help
pnpm cli:build
```

If native modules fail after an Electron upgrade:

```bash
pnpm --filter @pond/desktop rebuild
```

See [`apps/desktop/README.md`](apps/desktop/README.md) for architecture and on-disk layout. Before contributing, read the [contributor guide](CONTRIBUTING.md), [code standards](docs/contributing/code-standards.md), and [desktop architecture](docs/contributing/architecture.md). Run `pnpm check` and `pnpm build` from the repository root to verify a change.

## Assistant and MCP

Assistant lives in the right column. It searches this library with a key you paste in Settings, or a local host you run such as Ollama or LM Studio. Pond never stores those keys on a Pond server.

You can also use a subscription through a local Codex or Claude Code installation. In a terminal, run `codex login` and sign in with ChatGPT, or run `claude auth login` and sign in with your Claude plan. In Settings → Providers → Subscriptions, add the provider and click Connect. Select its default model in the Assistant composer. No API key is needed. Removing a connection from Pond does not sign you out of the CLI.

These connections run the official CLIs on your computer; inference still goes to OpenAI or Anthropic and counts against your plan's limits. Pond does not read or copy CLI tokens: Codex receives a narrow link to its existing file-backed ChatGPT sign-in (on Windows without symlink permission, a private copy that is deleted when the run ends). Keyring-backed Codex sign-ins are rejected with instructions to create the isolated file-backed connection that Pond requires. API-key sign-ins are rejected and inherited provider credentials and routing overrides are removed from these processes. The CLI returns structured requests to Pond's existing tool loop, so Library access, citations, and review before Apply retain the same behavior. CLI tools, MCP, and user or project customizations are disabled. Organization-managed Claude Code policy hooks can still run because Claude Code applies administrator policy in safe mode; its hook-free bare mode also disables the subscription OAuth credentials this connection needs. This integration supports text and Library tools; use a vision provider for image or file attachments. The default model is selected by the CLI; custom model IDs must be available to your plan. Fast and Reasoning controls are not exposed for these connections.

Cursor, Claude, and other MCP hosts can search the same library. Pond speaks MCP over stdio. This block belongs in Cursor `mcp.json`. It launches Pond as a local stdio server (`--mcp`) against the library on this computer:

```json
{
  "mcpServers": {
    "pond": {
      "command": "/Applications/Pond.app/Contents/MacOS/Pond",
      "args": ["--mcp"]
    }
  }
}
```

On Windows the command is the installed `Pond.exe`, by default `C:\Users\<you>\AppData\Local\Programs\Pond\Pond.exe`. Copy the exact command from Settings → Model Context Protocol → Advanced. Pond does not host a public MCP URL.

## Library

The desktop library is a three-column DAM: folder sidebar, image list, Assistant. Folders, Uncategorized, List layout, and Eagle import that keeps folder trees ship in this cut.

See the [roadmap](ROADMAP.md) for what's next. Not on it: Eagle Cloud, their Plugin Center store, or Photoshop-class format preview.

## How sourcing works (and your responsibility)

Pond's source adapters run entirely through **your own authenticated browser
session, on your own machine**. There are no Pond-operated scraping servers and
no credential harvesting. Pond never sees or stores your platform passwords or
cookies on any remote service. When you import from a source, a hidden local
browser window loads the pages you already have access to and reads what's on
them.

Because that traffic comes from your account, Pond is deliberately conservative:
a built-in rate governor paces every request, respects platform rate-limit
signals (`retry-after` and friends), backs off instead of escalating, persists
cooldowns across restarts, and hard-stops a source if it detects a
challenge/checkpoint. You can turn off automatic fetching at any time in
Settings → Harvesting.

That said, **you are responsible for your own use** of each platform under its
Terms of Service. Pond is a personal tool for organizing things you've already
saved; use it accordingly. If you're writing or reviewing a source adapter, see
the [`CONTRIBUTING`](CONTRIBUTING.md) "Add a source" section for the boundaries
adapter authors are expected to respect.

Read [Responsible use](RESPONSIBLE-USE.md) before you connect an account.

## Documentation

- [License](LICENSE)
- [Privacy](PRIVACY.md)
- [Responsible Use](RESPONSIBLE-USE.md)
- [Roadmap](ROADMAP.md)
- [Security](SECURITY.md)
- [Releasing](RELEASING.md)
- [Contributing](CONTRIBUTING.md)
- [Extension](apps/extension/README.md)
- [Raycast Extension](apps/raycast/README.md)
- [Supported File Formats](docs/supported-formats.md)
