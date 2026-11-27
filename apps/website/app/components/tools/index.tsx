import { IconBracketsCurly, IconPuzzle, IconTerminal } from "@pond/icons";
import type { IconComponent } from "@pond/icons/types";
import { BUILD } from "../../content/home";
import type { ToolIcon } from "../../content/home";
import { Cta } from "../cta";
import styles from "./styles.module.css";

const ICONS: Record<ToolIcon, IconComponent> = {
  mcp: IconPuzzle,
  cli: IconTerminal,
  api: IconBracketsCurly,
};

/** The three ways in for agents and scripts, as one ruled row. */
export function Tools() {
  return (
    <ul className={styles.grid}>
      {BUILD.tools.map((tool) => {
        const Icon = ICONS[tool.icon];
        return (
          <li key={tool.name} className={styles.tool}>
            <Icon size={24} className={styles.icon} aria-hidden />
            <div className={styles.words}>
              <h3 className={styles.title}>{tool.name}</h3>
              <p className={styles.body}>{tool.body}</p>
            </div>
            <Cta href={tool.href} variant="outline" size="sm" block>
              {tool.action}
            </Cta>
          </li>
        );
      })}
    </ul>
  );
}
