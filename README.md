> The web is a sea of information. Everyone deserves their own pond.

Pond keeps what you save from the web in a library folder on your computer: posts, images, videos, links, and pages. There's no Pond account and no Pond cloud.

The [wiki](https://github.com/raphaelsalaja/pond/wiki) covers every feature, from [Sources](https://github.com/raphaelsalaja/pond/wiki/Sources) and [Fish](https://github.com/raphaelsalaja/pond/wiki/Fish) to the [Model Context Protocol](https://github.com/raphaelsalaja/pond/wiki/Model-Context-Protocol), the [Local API](https://github.com/raphaelsalaja/pond/wiki/Local-API), and [Troubleshooting](https://github.com/raphaelsalaja/pond/wiki/Troubleshooting).

## Install

Download Pond for macOS, Windows, or Linux from [GitHub Releases](https://github.com/raphaelsalaja/pond/releases). On a Mac, you can also install it with Homebrew:

```bash
brew tap raphaelsalaja/pond https://github.com/raphaelsalaja/pond
brew install --cask raphaelsalaja/pond/pond
```

Then add the browser extension from the [Chrome Web Store](https://chromewebstore.google.com/detail/ghigndnldiagchoaifgndleogpkendbc) or [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/desktop%40pond.so/). [Install Pond](https://github.com/raphaelsalaja/pond/wiki/Install-Pond) has system requirements, the Windows SmartScreen prompt, and the Linux packages.

## Your accounts, your responsibility

Sources run through your own browser session on your own computer. There are no Pond scraping servers, and Pond never sends your passwords or cookies anywhere. Pond paces every request, backs off when a site asks it to, and stops a Source if the site shows a challenge.

You're responsible for following each site's terms. Read [Responsible Use](https://pond.raphaelsalaja.com/responsible-use) before you connect an account. If you're writing a source adapter, see "Add a source" in [CONTRIBUTING](.github/CONTRIBUTING.md#add-a-source).

## Development

Requires Node.js 24 (see `.nvmrc`) and pnpm 11.27.0. On Windows, see [Windows development](.github/CONTRIBUTING.md#windows-development) for the extra prerequisites.

```bash
pnpm install
pnpm dev
```

Run each of these in its own terminal for the browser extension, the Raycast extension, and the CLI:

```bash
pnpm --filter @pond/extension dev
pnpm --dir apps/raycast develop
pnpm cli -- --help
pnpm cli:build
```

If native modules fail after an Electron upgrade:

```bash
pnpm --filter @pond/desktop rebuild
```

See [`apps/desktop/README.md`](apps/desktop/README.md) for architecture and on-disk layout. Before contributing, read the [contributor guide](.github/CONTRIBUTING.md), its [code standards](.github/CONTRIBUTING.md#code-standards), and [desktop architecture](apps/desktop/ARCHITECTURE.md). Run `pnpm check` and `pnpm build` from the repository root to verify a change.

## Support Pond

Pond is free, open source, and made by one person. Support covers the Apple Developer membership, Windows code signing, the website, and time to keep sources working as sites change.

- [Buy Me a Coffee](https://buymeacoffee.com/raphaelsalaja), once or monthly
- [GitHub Sponsors](https://github.com/sponsors/raphaelsalaja)
- [Star the repository](https://github.com/raphaelsalaja/pond) to help others find it

## Documentation

- [Wiki](https://github.com/raphaelsalaja/pond/wiki)
- [License](LICENSE)
- [Privacy](https://pond.raphaelsalaja.com/privacy)
- [Responsible Use](https://pond.raphaelsalaja.com/responsible-use)
- [Roadmap](https://github.com/raphaelsalaja/pond/wiki/Roadmap)
- [Security](.github/SECURITY.md)
- [Releasing](.github/RELEASING.md)
- [Contributing](.github/CONTRIBUTING.md)
- [Local API Reference](https://github.com/raphaelsalaja/pond/wiki/Local-API-Reference)
- [Extension](apps/extension/README.md)
- [Raycast Extension](apps/raycast/README.md)
- [Supported File Formats](https://github.com/raphaelsalaja/pond/wiki/Supported-File-Formats)
