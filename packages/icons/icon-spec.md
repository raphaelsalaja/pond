# Icon spec

Measured from the 60 icons on `0 0 18 18` in `packages/icons/src`: `Archive`, `Arrow Down`, `Arrow Left`, `Arrow Right`, `Arrow Up`, `Arrow Up Right`, `Ban`, `Bell`, `Bookmark`, `Bullet List`, `Calendar`, `Chat Bubble`, `Check`, `Chevron Down`, `Chevron Left`, `Chevron Right`, `Circle Check`, `Circle Info`, `Circle Warning`, `Circle Xmark`, `Clock`, `Code`, `Copy`, `Dots`, `Download`, `Envelope`, `Eye`, `File`, `File Plus`, `Folder`, `Folder Open`, `Folder Plus`, `Gear`, `Globe`, `Grid`, `Heart`, `History`, `House`, `Image`, `Inbox`, `Layers`, `Link 2`, `Lock`, `Magnifier`, `Media Pause`, `Media Play`, `Minus`, `Pencil`, `Pin Tack`, `Plus`, `Refresh`, `Sliders`, `Sparkle`, `Star`, `Tag`, `Trash`, `Upload`, `User`, `Video`, `Xmark`.

## 18

| Property | Value |
| --- | --- |
| viewBox | 0 0 18 18 |
| Stroke | 1.25, currentColor |
| Caps and Joins | round, round |
| Corner Radii | 0.5, 0.625, 0.75, 0.875, 1, 1.125, 1.25, 1.5, 1.625, 1.875, 2.125, 2.25 |
| Grid | Every coordinate a multiple of 0.125 |
| Padding | 1.75 from ink to the viewBox edge |
| Round Overshoot | 0.25 past the padding |
| Keylines | square 14.5, circle 15 across, wide 14.5 by 12.5, tall 12.5 by 14.5, glyph 12.5 |
| Ink Coverage | Outline 3.9% to 30.6%, Filled 16.0% to 23.3% |
| Construction | Free curves in 1 of 60 icons |
| Corners | Rounded from 0.5 to 4.25 |
| Parts | Outline 1 to 6, Filled 2 to 4 per icon |
| Elements | path |
| Morph Form | No icon marked swaps |

## Voice

| Tendency | Must or should | Shown by |
| --- | --- | --- |
| Round ends and joins | Must | Check, Chevron Down |
| Shapes sit inside the keylines, never on the frame | Must | Folder, Image |
| Arrows, chevrons, checks and plus sit on the smaller glyph keyline | Must | Arrow Right, Plus |
| A corner's radius fits its part | Must | Star, Tag |
| Dots are solid, never rings | Must | Eye, Tag |
| Containers are circles before squares | Should | Circle Check, Clock |
| The magnifier's handle is heavier and clear of the lens | Should | Magnifier, the only handle in the seed |
| Outward arrows point up and right, slashes cut top left to bottom right | Must | Arrow Up Right, Ban |
| Never busy: one idea, the fewest parts that read | Must | Gear, Folder Plus |
| No icon takes more attention than its label | Standard | Folder, User |
