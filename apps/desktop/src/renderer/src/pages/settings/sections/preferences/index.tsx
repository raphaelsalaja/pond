import { IconChevronExpandYOutline12 } from "@pond/icons/outline/12";
import { ContextMenu, Input, Select, Switch, useToast } from "@pond/ui";
import { useCallback } from "react";
import { Settings } from "@/components/settings";
import { usePrefs } from "@/pool/prefs";
import { buildAvatarUrl } from "@/pool/url";
import styles from "./styles.module.css";

export function PreferencesSection() {
  const toast = useToast();
  const [prefs, patch] = usePrefs("preferences");
  const [profile, patchProfile] = usePrefs("profile");

  const pickAvatar = useCallback(async () => {
    const res = (await window.pond.query("profile.pickAvatar", {})) as
      | { ok: true; path: string }
      | { ok: false; reason: string };
    if (!res.ok) {
      if (res.reason !== "cancelled") {
        toast.add({
          title: "Couldn't set avatar",
          description: res.reason,
          type: "error",
        });
      }
      return;
    }
    toast.add({ title: "Avatar updated", type: "success" });
  }, [toast]);

  const clearAvatar = useCallback(async () => {
    await window.pond.query("profile.clearAvatar", {});
    toast.add({ title: "Avatar removed", type: "success" });
  }, [toast]);

  return (
    <Settings.Page>
      <Settings.Header>
        <Settings.Title>Preferences</Settings.Title>
        <Settings.Description>
          Your personal details and how Pond looks.
        </Settings.Description>
      </Settings.Header>

      <Settings.Section>
        <Settings.SectionTitle>Identity</Settings.SectionTitle>

        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Display Name</Settings.ItemTitle>
              <Settings.ItemDescription>
                Your personal identifier.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Input
                data-size="sm"
                placeholder="Your name"
                value={profile.displayName}
                onChange={(e) => patchProfile({ displayName: e.target.value })}
              />
            </Settings.ItemControl>
          </Settings.Item>

          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Avatar</Settings.ItemTitle>
              <Settings.ItemDescription>
                Your profile picture. Recommended size is 256×256px.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <ContextMenu.Root>
                <ContextMenu.Trigger
                  render={
                    <button
                      type="button"
                      aria-label={
                        profile.avatarPath ? "Change avatar" : "Pick avatar"
                      }
                      className={styles["image-picker"]}
                      onClick={() => void pickAvatar()}
                    >
                      {profile.avatarPath ? (
                        <img src={buildAvatarUrl(profile.avatarPath)} alt="" />
                      ) : null}
                    </button>
                  }
                />
                <ContextMenu.Portal>
                  <ContextMenu.Backdrop />
                  <ContextMenu.Positioner>
                    <ContextMenu.Popup>
                      <ContextMenu.Item onClick={() => void pickAvatar()}>
                        <ContextMenu.ItemLabel>
                          {profile.avatarPath ? "Change image…" : "Pick image…"}
                        </ContextMenu.ItemLabel>
                      </ContextMenu.Item>
                      {profile.avatarPath ? (
                        <ContextMenu.Item onClick={() => void clearAvatar()}>
                          <ContextMenu.ItemLabel>Remove</ContextMenu.ItemLabel>
                        </ContextMenu.Item>
                      ) : null}
                    </ContextMenu.Popup>
                  </ContextMenu.Positioner>
                </ContextMenu.Portal>
              </ContextMenu.Root>
            </Settings.ItemControl>
          </Settings.Item>
        </Settings.List>
      </Settings.Section>

      <Settings.Section>
        <Settings.SectionTitle>General</Settings.SectionTitle>
        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>
                Convert Text Emoticons to Emojis
              </Settings.ItemTitle>
              <Settings.ItemDescription>
                Replace shortcuts like <code>:)</code> with emoji on save.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Switch.Root
                checked={prefs.convertEmoticons}
                onCheckedChange={(v) => patch({ convertEmoticons: v })}
              />
            </Settings.ItemControl>
          </Settings.Item>
        </Settings.List>
      </Settings.Section>

      <Settings.Section>
        <Settings.SectionTitle>Interface</Settings.SectionTitle>
        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Use Pointer Cursors</Settings.ItemTitle>
              <Settings.ItemDescription>
                Show a hand cursor on hover instead of the default text caret.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Switch.Root
                checked={prefs.pointerCursors}
                onCheckedChange={(v) => patch({ pointerCursors: v })}
              />
            </Settings.ItemControl>
          </Settings.Item>

          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Theme</Settings.ItemTitle>
              <Settings.ItemDescription>
                System follows your OS. Light and dark stay fixed.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Select.Root
                value={prefs.theme}
                onValueChange={(v) =>
                  patch({ theme: v as "system" | "light" | "dark" })
                }
              >
                <Select.Trigger>
                  <Select.Value />
                  <Select.Icon>
                    <IconChevronExpandYOutline12 />
                  </Select.Icon>
                </Select.Trigger>
                <Select.Portal>
                  <Select.Positioner sideOffset={6}>
                    <Select.Popup>
                      <Select.Item value="system">
                        System Preference
                      </Select.Item>
                      <Select.Item value="light">Light</Select.Item>
                      <Select.Item value="dark">Dark</Select.Item>
                    </Select.Popup>
                  </Select.Positioner>
                </Select.Portal>
              </Select.Root>
            </Settings.ItemControl>
          </Settings.Item>
        </Settings.List>
      </Settings.Section>
    </Settings.Page>
  );
}
