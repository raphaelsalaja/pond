# Pull requests

Every PR body uses the same sections in the same order, so a reviewer always finds the proof in one place. The [PR template](../../.github/PULL_REQUEST_TEMPLATE.md) holds the skeleton.

## Body

| Section    | Required     | Contents                                                                         |
| ---------- | ------------ | -------------------------------------------------------------------------------- |
| Stack note | When stacked | One blockquote line at the top: `> Stacked on #533 and #541. Merge those first.` |
| Summary    | Yes          | Up to three sentences: what changes for the reader, then why. `Closes #123`.     |
| Proof      | Yes          | Screenshots, clips, or measurements. See [Proof](#proof).                        |
| Changes    | Yes          | One bullet per change, bold lead-in for the area (`**Card:**`).                  |
| Notes      | No           | `Not in this PR`, platform limits, follow-ups.                                   |
| Test plan  | Yes          | Checks you ran and manual steps, as the template lists them.                     |

Keep explanations out of the Proof section and images out of every other section.

## Proof

Proof matches the PR head. When the UI changes, recapture and replace the whole Proof section. Don't append "Updated screenshots" blocks, leave stale images, or reuse another PR's uploads.

### Layout

The Proof section has up to three parts, in this order:

1. **States table:** one row per state the reader should check, at most four rows. The first row is the overview.
2. **Clip:** when the change moves. See [Clips](#clips).
3. **More states:** anything else inside a collapsed `<details>` block.

Show each image once. Don't repeat a table cell as a full-width image above it.

Columns depend on the change:

| Change               | Columns                                                                               |
| -------------------- | ------------------------------------------------------------------------------------- |
| New or changed UI    | `State`, `Light`, `Dark`                                                              |
| Bug fix              | `State`, `Before`, `After`                                                            |
| Performance or no UI | A measurements table with `Before` and `After`, plus one sentence on how you measured |

Markdown images scale to the cell only with an explicit width, so images inside tables use `<img>` with `width="400"`. This Proof section has two states in both themes, a clip, and a collapsed extra state:

```markdown
## Proof

| State           | Light                                                                                             | Dark                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Open            | <img src="https://github.com/user-attachments/assets/…" width="400" alt="Inbox open, light">      | <img src="https://github.com/user-attachments/assets/…" width="400" alt="Inbox open, dark">      |
| Drag over Trash | <img src="https://github.com/user-attachments/assets/…" width="400" alt="Card over Trash, light"> | <img src="https://github.com/user-attachments/assets/…" width="400" alt="Card over Trash, dark"> |

**Drag a card onto Trash**

https://github.com/user-attachments/assets/…

<details>
<summary>More states</summary>

| State | Light                                                                                         | Dark                                                                                         |
| ----- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Empty | <img src="https://github.com/user-attachments/assets/…" width="400" alt="Empty Inbox, light"> | <img src="https://github.com/user-attachments/assets/…" width="400" alt="Empty Inbox, dark"> |

</details>
```

### Clips

Record a clip only for motion, drag, or a multi-step flow. Keep it under 20 seconds, one behavior per clip, light theme unless the change is theme-specific. GitHub plays a clip only when its URL sits on its own line, never inside a table. Put a bold caption on the line above:

```markdown
**Drag a Save onto a folder chip**

https://github.com/user-attachments/assets/…
```

### Captions and alt text

- Captions and alt text name the state the reader sees (`Card over Trash, dark`), never the filename. `gh image` prints the filename as alt text, so rewrite it.
- State names are sentence case and match the UI copy (`Needs Review`, not `review tab`).

### Capture

- Capture with [`scripts/capture-proof.cjs`](../CONTRIBUTING.md#pr-proof) so every image has the same frame, size, and wallpaper. Run each scenario with `--theme=light` and `--theme=dark`.
- For a bug fix, shoot both states in one run and use `ctx.shot("after", { pair: "before" })` when one side-by-side image reads better than two cells.
- Use a screenshot of the real app only when the harness can't reproduce the behavior, such as native keyboard shortcuts or OS drag. Crop it to the window and caption the row `Real app`, or say it once above the table when every row is.

### Files

Write captures to `.artifacts/proof/<branch>/`, named `NN-state-theme`, so they upload in reading order:

```text
.artifacts/proof/feat-inbox-review/
  01-open-light.png
  01-open-dark.png
  02-drag-trash-light.png
  02-drag-trash-dark.png
  03-drag-to-folder.mp4
```

Upload with `gh image <files>` from the repository root and paste the printed URLs. Never commit captures; `.artifacts/` is ignored.
