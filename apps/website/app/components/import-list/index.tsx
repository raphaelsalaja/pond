import styles from "./styles.module.css";

const IMPORTS = [
  {
    title: "Data Export",
    body: "X likes, Instagram saved and liked posts, TikTok favorites and likes, YouTube playlists from Google Takeout, and Reddit saved and upvoted posts, with original dates when the archive has them.",
  },
  {
    title: "Eagle Library",
    body: "The folder tree, tags, notes, and thumbnails. Importing the same library again doesn't duplicate anything.",
  },
  {
    title: "Eagle and Pond Packages",
    body: "Items someone packed for you in Eagle or in another Pond library.",
  },
  {
    title: "mymind",
    body: "The cards from your mymind export.",
  },
  {
    title: "Browser Bookmarks",
    body: "The bookmarks file Chrome, Safari, Firefox, and other browsers export.",
  },
  {
    title: "Legacy Libraries",
    body: "Exports from ArtStation, Huaban, Pixave, and Inboard.",
  },
  {
    title: "Files, Folders, and Links",
    body: "Any file, a whole folder, a list of links, or what's on your clipboard.",
  },
  {
    title: "Page Assets",
    body: "Every image and file on a page you link to.",
  },
];

export function ImportList() {
  return (
    <ol className={styles.root}>
      {IMPORTS.map((entry, index) => (
        <li key={entry.title} className={styles.item}>
          <span className={styles.index}>
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className={styles.text}>
            <span className={styles.title}>{entry.title}</span>
            <span className={styles.body}>{entry.body}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
