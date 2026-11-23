# Pond for Alfred

Search and save to your [Pond](https://github.com/raphaelsalaja/pond) library from Alfred. The workflow talks to the Pond app over its Local API on `127.0.0.1`, so nothing leaves your Mac.

## What it does

| Keyword        | What it does                                                                       |
| -------------- | ---------------------------------------------------------------------------------- |
| `pond <query>` | Search your saves. With no query, it shows what you saved last.                    |
| `psave <url>`  | Save a link and show a notification. Also available as a Universal Action on URLs. |

In `pond` results, ↵ opens the link, ⌘↵ opens the save in Pond, and ⌥↵ copies the link. Saves without a web link open in Pond.

## Set up

You need macOS, Alfred 5 with the Powerpack, and Pond running with a library open.

1. In Pond, open **Settings → Local API** and create a token with **Search Saves** and **Add and Edit Saves** access.
2. Double-click `Pond.alfredworkflow` to install it.
3. Paste the token into **Pond Token** in the workflow's configuration.

The workflow uses a scoped token, never the Local API Token. Revoke it in **Settings → Local API** when you remove the workflow.

## Build

```bash
pnpm --filter @pond/alfred pack:workflow
```

This compiles `src/search.ts` and `src/save.ts` to JavaScript for Automation with tsup, then zips them with `workflow/` into `dist/Pond.alfredworkflow`.

### Export the workflow configuration

`workflow/info.plist` comes from Alfred's editor, because Alfred generates object IDs and layout. To recreate it, make a blank workflow named **Pond** with the bundle ID `so.pond.alfred` and add:

1. **Workflow Configuration**: a Text Field with the variable `POND_TOKEN`, labeled **Pond Token**, marked as a password.
2. **Script Filter**: keyword `pond`, argument optional, language `/bin/bash`, script `osascript -l JavaScript ./search.js "$1"`, with **Alfred filters results** off. Connect it to **Open URL** with `{query}`. Connect the ⌘ modifier to a second **Open URL**, and the ⌥ modifier to **Copy to Clipboard**.
3. **Keyword** `psave` with a required argument, and a **Universal Action** for URLs. Connect both to a **Run Script** with `osascript -l JavaScript ./save.js "$1"`, then to **Post Notification** with `{query}`.

Export it, then copy its `info.plist` into `workflow/`.

## Troubleshooting

| What you see                 | What to do                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------ |
| Pond isn't running           | Open Pond. Turn on **Launch at Login** to keep it ready.                       |
| Pond didn't accept the token | Create a new token in **Settings → Local API** and paste it into the workflow. |
| The token can't search       | Give the token **Search Saves** access.                                        |
| The token can't save         | Give the token **Add and Edit Saves** access, then save again.                 |
