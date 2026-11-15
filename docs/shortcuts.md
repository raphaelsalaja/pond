# Shortcuts

Save to Pond from Shortcuts with a `pond://save` link. Pond saves in the background and shows a notification, without opening a window.

```text
pond://save?url=https%3A%2F%2Fexample.com&tags=posters,type
```

| Parameter | Required | Meaning |
| --- | --- | --- |
| `url` | Yes | The page to save, URL-encoded. Pond accepts only `http` and `https` links. |
| `tags` | No | Comma-separated tag names. |
| `folder` | No | A folder id. Right-click a folder, choose **Copy Folder Link**, and use the part between `pond://folder/` and `?`. |

Pond must be running with a library open. Pond accepts up to 20 saves a minute from links, so a site you allowed to open `pond://` can't flood your library.

## Save from the Share menu

1. Create a shortcut and turn on **Show in Share Sheet**. Set it to receive **URLs**.
2. Add **URL Encode** with **Shortcut Input**.
3. Add **Text** with `pond://save?url=` followed by the **URL Encoded Text** variable.
4. Add **Open URLs** with that text.

## Save the front Safari tab

1. Add **Get Current URL from Safari**.
2. Add **URL Encode**, **Text**, and **Open URLs** as above.
3. Give the shortcut a keyboard shortcut in its details.

## Save with tags or into a folder

Add `&tags=` or `&folder=` to the end of the text in step 3:

```text
pond://save?url=<URL Encoded Text>&tags=reading&folder=01J8Z3
```

## Open the Inbox

Add **Open URLs** with this link to go straight to the Saves waiting for review:

```text
pond://inbox
```
