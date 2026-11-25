import {
  AutoEmbedOption,
  LexicalAutoEmbedPlugin,
} from "@lexical/react/LexicalAutoEmbedPlugin";
import type {
  EmbedConfig,
  EmbedMatchResult,
} from "@lexical/react/LexicalAutoEmbedPlugin";
import { $insertNodeToNearestRoot } from "@lexical/utils";
import { Menu } from "@pond/ui";
import type { LexicalEditor } from "lexical";
import { useMemo } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import {
  $createYouTubeNode,
  parseYouTubeId,
  youtubeWatchUrl,
} from "../youtube-node";
import styles from "./styles.module.css";

interface YouTubeEmbedConfig extends EmbedConfig {
  type: "youtube";
}

const YOUTUBE_EMBED: YouTubeEmbedConfig = {
  type: "youtube",
  parseUrl: (text) => {
    const id = parseYouTubeId(text);
    if (!id) return null;
    return { id, url: youtubeWatchUrl(id) };
  },
  insertNode: (editor: LexicalEditor, result: EmbedMatchResult) => {
    editor.update(() => {
      $insertNodeToNearestRoot($createYouTubeNode(result.id));
    });
  },
};

export function YouTubeEmbed() {
  const configs = useMemo(() => [YOUTUBE_EMBED], []);

  return (
    <LexicalAutoEmbedPlugin<YouTubeEmbedConfig>
      embedConfigs={configs}
      getMenuOptions={(_config, embedFn, dismissFn) => [
        new AutoEmbedOption("Embed", {
          onSelect: () => embedFn(),
        }),
        new AutoEmbedOption("Keep as Link", {
          onSelect: () => dismissFn(),
        }),
      ]}
      menuRenderFn={(
        anchor,
        { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex, options },
      ) =>
        anchor.current
          ? createPortal(
              <EmbedMenu>
                {options.map((option, index) => (
                  <Menu.Row
                    key={option.key}
                    id={`note-embed-${option.key}`}
                    ref={(element) => option.setRefElement(element)}
                    role="option"
                    aria-selected={selectedIndex === index}
                    tabIndex={-1}
                    highlighted={selectedIndex === index}
                    onMouseDown={(event: ReactMouseEvent) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onClick={() => selectOptionAndCleanUp(option)}
                  >
                    <Menu.ItemLabel>{option.title}</Menu.ItemLabel>
                  </Menu.Row>
                ))}
              </EmbedMenu>,
              anchor.current,
            )
          : null
      }
    />
  );
}

function EmbedMenu({ children }: { children: React.ReactNode }) {
  return (
    <Menu.Surface className={styles.slash} aria-label="Embed">
      <div className={styles.commands} data-scroll-fade="vertical">
        <Menu.Group>{children}</Menu.Group>
      </div>
    </Menu.Surface>
  );
}
