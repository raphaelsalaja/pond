import { Menu } from "electron";
import type { MenuItemConstructorOptions, WebContents } from "electron";
import { sym } from "./lib/menu-symbol";

export function attachEditableContextMenu(contents: WebContents): void {
  contents.on("context-menu", (_event, params) => {
    if (!params.isEditable) {
      return;
    }

    const template: Array<MenuItemConstructorOptions> = [];

    for (const suggestion of params.dictionarySuggestions) {
      template.push({
        label: suggestion,
        click: () => contents.replaceMisspelling(suggestion),
      });
    }
    if (params.misspelledWord) {
      template.push(
        {
          ...sym("plus"),
          label: "Add to Dictionary",
          click: () =>
            contents.session.addWordToSpellCheckerDictionary(
              params.misspelledWord,
            ),
        },
        { type: "separator" },
      );
    }

    template.push(
      { ...sym("scissors"), role: "cut", enabled: params.editFlags.canCut },
      { ...sym("doc.on.doc"), role: "copy", enabled: params.editFlags.canCopy },
      {
        ...sym("doc.on.clipboard"),
        role: "paste",
        enabled: params.editFlags.canPaste,
      },
      { type: "separator" },
      {
        ...sym("checkmark.square"),
        role: "selectAll",
        enabled: params.editFlags.canSelectAll,
      },
    );

    Menu.buildFromTemplate(template).popup();
  });
}
