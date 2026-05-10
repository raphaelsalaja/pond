import { Button, Input, Select, Switch, useToast } from "@pond/ui";
import { useCallback } from "react";
import { Settings } from "@/components/settings";
import { usePrefs } from "@/pool/prefs";

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
                Your personal indentifer.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Input.Root
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
                Your profile picture.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {profile.avatarPath ? (
                  <img
                    src={`file://${profile.avatarPath}`}
                    alt="avatar"
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 999,
                      objectFit: "cover",
                    }}
                  />
                ) : null}
                <Button size="sm" onClick={() => void pickAvatar()}>
                  Pick Image…
                </Button>
                {profile.avatarPath ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void clearAvatar()}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
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
                Replace shortcuts like <code>:)</code> with the matching emoji
                on save.
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
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="system">System Preference</Select.Item>
                  <Select.Item value="light">Light</Select.Item>
                  <Select.Item value="dark">Dark</Select.Item>
                </Select.Content>
              </Select.Root>
            </Settings.ItemControl>
          </Settings.Item>
        </Settings.List>
      </Settings.Section>
    </Settings.Page>
  );
}
