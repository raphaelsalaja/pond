# Supported file formats

Pond stores every readable, non-empty file you import. Its Eagle compatibility manifest covers all 126 unique extensions shipped in Eagle's current macOS and Windows manifests, plus 17 formats documented by Eagle's official format extensions. Files outside that manifest are stored too.

Support has four separate guarantees:

1. **Lossless storage:** Pond copies the original bytes into the library and never replaces them with a preview.
2. **Card preview:** Pond uses a built-in renderer, a generated preview, Eagle's supplied thumbnail during migration, or the operating system's thumbnail provider.
3. **In-app viewer:** Browser-safe images, playable video/audio, PDFs, fonts, and text open directly in Pond.
4. **Open and export:** Every stored original can be opened in its default app, revealed, copied, dragged, or exported even when no preview provider exists.

A file tile may appear when macOS Quick Look or the Windows thumbnail provider cannot render a proprietary format. That does not affect the stored original.

## Built-in preview support

| Format                                                | Stored        | Card preview                               | In-app viewer                                                   |
| ----------------------------------------------------- | ------------- | ------------------------------------------ | --------------------------------------------------------------- |
| JPEG, PNG, GIF, WebP, AVIF, SVG, BMP, ICO             | Original file | Image                                      | Image                                                           |
| HEIC, HEIF, JPEG XL, TIFF                             | Original file | Generated WebP                             | Generated image preview                                         |
| MP4, WebM, MOV, M4V, MKV                              | Original file | Image or video poster                      | Video player when the codec is available                        |
| MP3, WAV, M4A, AAC, FLAC, OGG, Opus                   | Original file | File tile or thumbnail                     | Audio player when the codec is available                        |
| PDF                                                   | Original file | First-page system preview                  | PDF viewer                                                      |
| TTF, OTF, TTC, WOFF, WOFF2                            | Original file | System preview or file tile                | Editable specimen and glyph preview                             |
| TXT, Markdown                                         | Original file | Text tile                                  | Text viewer                                                     |
| PSD, RAW, Office, iWork, and proprietary design files | Original file | Operating-system or Eagle-supplied preview | Full-size generated preview with open/export fallback           |
| GLB, FBX, OBJ, STL, PLY, 3MF, 3DS, DAE                | Original file | Operating-system preview or model frame    | Interactive 3D orbit viewer with animation playback             |
| EPUB                                                  | Original file | Operating-system or EPUB cover preview     | Script-disabled reader with contents, paging, and type controls |
| ZIP                                                   | Original file | File tile or thumbnail                     | Bounded, searchable archive directory inspector                 |
| HTML                                                  | Original file | Operating-system preview or file tile      | Offline sandboxed rendering plus source view                    |
| Other files                                           | Original file | System preview, file tile, or thumbnail    | Full-size system preview or explicit open/export fallback       |

Audio and video playback depends on the codecs available to Electron and the operating system. Pond still stores and exports a file when its codec cannot play in the app.

## Detail viewer depth

Pond treats viewer depth separately from import support:

| Viewer depth                | Meaning                                                                                                                                              | Examples                                                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Interactive                 | Pond parses or plays the original directly and exposes format-specific controls.                                                                     | Browser-safe images, video/audio, PDF, fonts, text/Markdown, EPUB, ZIP, HTML, and the supported open 3D formats |
| Generated full-size preview | Pond asks the operating system's registered preview provider for a rendered image and shows it at viewer resolution.                                 | PSD/PSB, camera RAW, DOC/DOCX, XLS/XLSX, PPT/PPTX, Apple iWork, Affinity, Sketch, C4D, CAD, and mind maps       |
| External fallback           | Pond shows the file identity and keeps Open and Export available when neither its built-in renderer nor the operating system can interpret the file. | Proprietary formats without an installed provider, RAR/7z contents, SWF, and unknown binary files               |

Generated previews never replace the original. They are disposable cache files. Office preview parity intentionally targets the first rendered page because Eagle documents the same first-page limitation for PPT, DOC, and XLS files.

## Eagle compatibility matrix

Every extension below has an explicit media classification and MIME fallback. Proprietary formats use a safe generic viewer with OS thumbnail, Open, and Export actions; Pond does not execute imported HTML, MHTML, web archives, or SWF content.

| Category                       | Extensions                                                                                                                                                                                 | Pond behavior                                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Raster and rendered images     | `avif`, `png`, `jpg`, `jfif`, `jxl`, `jpe`, `insp`, `gif`, `tiff`, `tif`, `jpeg`, `svg`, `bmp`, `icns`, `ico`, `webp`, `hdr`, `exr`, `hif`, `heic`, `heif`, `tga`, `dds`, `livp`, `base64` | Built-in image viewer where safe; otherwise OS thumbnail and external open                                                 |
| Camera RAW                     | `arw`, `cr2`, `cr3`, `crw`, `dng`, `raf`, `rw2`, `orf`, `nef`, `nrw`, `raw`, `3fr`, `erf`, `srw`, `sr2`, `pef`, `x3f`, `mrw`                                                               | Full-size OS-generated preview with external open fallback                                                                 |
| Design and publishing          | `psd`, `psdt`, `psb`, `ai`, `ait`, `eps`, `xd`, `clip`, `prd`, `fig`, `sketch`, `af`, `afpub`, `afdesign`, `afphoto`, `cdr`, `skt`, `pxd`, `indd`, `indt`, `idml`, `ps`                    | Full-size OS-generated preview with external open fallback                                                                 |
| Video and animation containers | `afx`, `eva`, `vap`, `360`, `ts`, `3gp`, `mp4`, `mkv`, `mpg`, `mov`, `m4v`, `webm`, `avi`, `mts`, `wmv`, `flv`, `m2ts`, `f4v`, `av1`, `hevc`, `rm`, `rmvb`, `vp8`, `vp9`, `mpeg`, `ogv`    | Built-in playback for tested containers/codecs; otherwise OS thumbnail and external open                                   |
| Audio                          | `mp3`, `wav`, `ogg`, `flac`, `aac`, `m4a`                                                                                                                                                  | Built-in player when the codec is available                                                                                |
| Documents and mind maps        | `pdf`, `key`, `pages`, `number`, `numbers`, `potx`, `pptx`, `ppt`, `doc`, `docx`, `xls`, `xlsx`, `graffle`, `xmind`, `mindnode`, `eddx`, `emmx`, `epub`                                    | Built-in PDF and EPUB viewers; Office/iWork/mind-map files use a full-size OS preview and external fallback                |
| 3D, CAD, and scene files       | `c4d`, `blend`, `skp`, `dwg`, `glb`, `fbx`, `obj`, `3ds`, `3mf`, `dae`, `ifc`, `ply`, `stl`, `blender`                                                                                     | Interactive viewer for GLB/FBX/OBJ/3DS/3MF/DAE/PLY/STL; OS preview and external fallback for proprietary scene/CAD formats |
| Fonts                          | `ttf`, `otf`, `ttc`, `woff`, `woff2`                                                                                                                                                       | Built-in specimen viewer                                                                                                   |
| Web and shortcuts              | `url`, `html`, `mhtml`, `webarchive`                                                                                                                                                       | HTML gets a scriptless, network-blocked viewer; other containers use OS preview and external fallback                      |
| Archives                       | `zip`, `rar`, `7z`                                                                                                                                                                         | ZIP directory inspector; RAR/7z use OS preview and external fallback                                                       |
| Text                           | `txt`                                                                                                                                                                                      | Built-in text viewer                                                                                                       |
| Legacy interactive animation   | `swf`                                                                                                                                                                                      | Stored without execution; file tile and external open                                                                      |

The nonstandard `base64` and `blender` identifiers are included because Eagle's published/installed manifests contain them. Conventional Blender `.blend` files are included separately.

## Original-file guarantee

Import copies the source bytes into the Pond library. Pond may sanitize the stored filename or add a numeric suffix to prevent a collision. It does not replace the original with a converted preview.

Generated WebP previews live in Pond's thumbnail cache. Deleting the cache does not affect the original. Pond rebuilds previews when they are needed.

Open, reveal, copy, drag, and export actions target the original file. A thumbnail sidecar affects the card only.

## Thumbnails

Right-click one save and choose **Set Thumbnail from File**. Choose an image in any supported image format. Pond writes `{filename}_thumbnail.png` beside the original, the same suffix Eagle uses. Use **Reset Thumbnail** to restore Pond's generated preview or file tile.

**Folder Cover** is separate: it is the save chosen to represent a folder in the sidebar.

## Data exports

Choose **New › Import Data Export** or **File › Import Data Export**, then pick the `.zip` or the unzipped folder you downloaded from the platform. Pond detects the platform from the files inside, so one action covers all five. It reads only the files below and never opens media in the archive.

| Platform                 | Files Pond reads                                                 | What imports                                                                 |
| ------------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| X                        | `data/like.js`, `data/like-part1.js`, and later parts            | Liked posts, without dates                                                   |
| Instagram                | `saved_posts.json`, `saved_collections.json`, `liked_posts.json` | Saved and liked posts and reels, with the date you saved or liked them       |
| TikTok                   | `user_data_tiktok.json` or `user_data.json`                      | Favorite Videos as saved, Like List as liked, with dates                     |
| YouTube (Google Takeout) | `YouTube and YouTube Music/playlists/*.csv`                      | Each playlist as a folder of saved videos; Liked videos as liked, with dates |
| Reddit                   | `saved_posts.csv`, `post_votes.csv`                              | Saved posts, and upvoted posts as liked, without dates                       |

X doesn't include bookmarks in its archive, so connect your X Account to sync them. Reddit saved comments are skipped. Dates and folders apply only to Saves this import creates. Each Save captures through its Source like a pasted link, so Instagram and TikTok Saves finish capturing once you connect an Account for that Source.

## Eagle library migration

Import an unpacked Eagle `.library` folder to migrate its items. Pond preserves:

- every visible original and multi-file attachment, under Eagle's original names;
- Eagle's `{filename}_thumbnail.png` sidecar independently from the originals;
- title, source URL, annotation, tags, width, and height;
- folder hierarchy, membership, color, and sibling order;
- stable Eagle source IDs so importing the same library again does not duplicate items.

Deleted items are skipped. Password-protected folders are skipped because Eagle does not expose their contents without unlocking them. The migration result reports imported, skipped, and failed item counts.

Direct `.eaglepack` ingestion is not treated as a full-library migration. EaglePack is a selected-item transfer format with undocumented package internals and does not preserve tag groups even when re-imported into Eagle. For a complete migration, select the original unpacked `.library` folder.
