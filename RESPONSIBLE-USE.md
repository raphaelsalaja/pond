# Responsible use

Pond is a personal archive. Use it to keep what you've already saved, liked, or bookmarked. It isn't a scraper for other people's content, and it isn't a way around a platform's rules.

## You're responsible for how you use it

Pond runs on your computer and acts as you. Every request a source makes comes from your account, through your own browser session. That means:

- Follow the terms of service of every platform you connect. Pond can't agree to them for you, and some platforms limit automated access.
- Connect only accounts you own.
- Treat what you save as a personal copy. Creators keep the rights to their work, so ask before you republish or share it.
- Keep watched public accounts for your own reference. Don't use Pond to monitor or harass people.

## How Pond keeps sync gentle

- A built-in rate governor paces every request.
- Pond respects rate-limit signals such as `retry-after`, and backs off instead of retrying harder.
- Cooldowns persist across restarts.
- A source stops when the platform shows a challenge or checkpoint.
- You can turn off automatic fetching at any time with **Use a Schedule** in Settings → Harvesting.

## What Pond never does

- Run scraping servers. Your sync traffic never passes through a Pond server.
- Ask for your platform passwords.
- Send your cookies or sessions off your computer.

## If a platform pushes back

If a platform warns you, limits your account, or asks you to verify, turn off **Use a Schedule** and wait before you sync again. If a source seems too aggressive, [open an issue](https://github.com/raphaelsalaja/pond/issues) so it can be fixed.

Contributors writing a source adapter should also read the "Add a source" section of [CONTRIBUTING](CONTRIBUTING.md).
