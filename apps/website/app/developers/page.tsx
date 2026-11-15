import { Wordmark } from "@pond/ui/wordmark";
import type { Metadata } from "next";
import styles from "./styles.module.css";

const REFERENCE = "https://github.com/raphaelsalaja/pond/blob/main/docs/api.md";
const CLIENT = "https://www.npmjs.com/package/pond-api";

export const metadata: Metadata = {
  title: "Developers · Pond",
  description:
    "Build on your Pond library with the local HTTP API and the MCP server. Everything runs on your computer.",
};

const ACCESS = [
  {
    name: "Search Saves",
    routes: [
      "GET /library/info, /library/tags, /library/folders, /library/views, /library/sources",
      "POST /library/query, /library/search",
      "GET or POST /saves/get",
      "GET /saves/info, /saves/text, /saves/status, /saves/thumb, /saves/file, /saves/related",
    ],
  },
  {
    name: "Export Files",
    routes: ["Every /library/conversion route"],
  },
  {
    name: "Add and Edit Saves",
    routes: [
      "POST /enqueue",
      "POST /saves/tags, /saves/folders, /saves/trash, /saves/restore, /saves/note, /saves/rating, /saves/favorite",
    ],
  },
];

const TOOLS = [
  {
    name: "Search Saves",
    tools:
      "query_library, search_library, read_save, grep_library, list_folders",
  },
  { name: "Open in Pond", tools: "open_save, apply_filter" },
  {
    name: "Export Files",
    tools:
      "list_conversion_capabilities, list_conversion_presets, save_conversion_preset, start_conversion, compress_images, conversion_status, cancel_conversion",
  },
];

export default function Developers() {
  return (
    <main className={styles.page}>
      <a className={styles.home} href="/" aria-label="Pond">
        <Wordmark size={24} />
      </a>
      <article className={styles.article}>
        <header className={styles.section}>
          <h1 className={styles.title}>Developers</h1>
          <p>
            Pond has a local HTTP API and an MCP server, so your scripts, apps,
            and agents can read and edit your library. Both run inside the Pond
            app on your computer. Nothing goes through a Pond server.
          </p>
        </header>

        <section className={styles.section}>
          <h2 className={styles.heading}>HTTP API</h2>
          <p>
            While Pond is open, it listens on loopback only, so nothing outside
            your computer can reach it.
          </p>
          <pre className={styles.code}>
            <code>http://127.0.0.1:41610/api/v2</code>
          </pre>
          <p>
            Create a token in Pond under Settings, Local API. Pick what it can
            reach, copy it, and send it as a Bearer header:
          </p>
          <pre className={styles.code}>
            <code>
              {`curl -H "Authorization: Bearer $POND_TOKEN" \\
  http://127.0.0.1:41610/api/v2/library/info`}
            </code>
          </pre>
          <p>
            Pond shows each token once and keeps only a hash. Revoke it in the
            same place when a tool no longer needs access.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.heading}>Access</h2>
          <p>
            A token can have any of these. Requests outside them answer{" "}
            <code className={styles.inline}>forbidden</code>.
          </p>
          <dl className={styles.terms}>
            {ACCESS.map((group) => (
              <div key={group.name} className={styles.term}>
                <dt className={styles.name}>{group.name}</dt>
                {group.routes.map((route) => (
                  <dd key={route} className={styles.detail}>
                    <code className={styles.inline}>{route}</code>
                  </dd>
                ))}
              </div>
            ))}
          </dl>
        </section>

        <section className={styles.section}>
          <h2 className={styles.heading}>Responses and versions</h2>
          <p>
            Every response is an envelope with{" "}
            <code className={styles.inline}>status</code>. Errors carry a stable{" "}
            <code className={styles.inline}>code</code>, like{" "}
            <code className={styles.inline}>save_not_found</code>, so branch on
            that and never on the message.
          </p>
          <p>
            <code className={styles.inline}>GET /app/info</code> needs no token
            and returns <code className={styles.inline}>apiVersion</code>. Minor
            versions only add endpoints, fields, and error codes. A breaking
            change ships under <code className={styles.inline}>/api/v3</code>,
            with <code className={styles.inline}>/api/v2</code> kept alongside
            it for at least one release.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.heading}>TypeScript client</h2>
          <p>
            <a
              className={styles.link}
              href={CLIENT}
              target="_blank"
              rel="noreferrer"
            >
              pond-api
            </a>{" "}
            has a typed method for every endpoint and validates each response.
            It depends only on zod.
          </p>
          <pre className={styles.code}>
            <code>npm install pond-api</code>
          </pre>
        </section>

        <section className={styles.section}>
          <h2 className={styles.heading}>MCP server</h2>
          <p>
            Agents like Cursor and Claude connect over stdio. Copy the command
            from Pond under Settings, Model Context Protocol. The switches on
            that page decide which tools answer:
          </p>
          <dl className={styles.terms}>
            {TOOLS.map((group) => (
              <div key={group.name} className={styles.term}>
                <dt className={styles.name}>{group.name}</dt>
                <dd className={styles.detail}>
                  <code className={styles.inline}>{group.tools}</code>
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className={styles.section}>
          <h2 className={styles.heading}>Reference</h2>
          <p>
            Request and response shapes for every route are in the{" "}
            <a
              className={styles.link}
              href={REFERENCE}
              target="_blank"
              rel="noreferrer"
            >
              API reference
            </a>
            .
          </p>
        </section>
      </article>
    </main>
  );
}
