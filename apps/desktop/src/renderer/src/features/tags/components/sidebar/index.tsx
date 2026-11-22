import { IconFolder, IconPlus, IconStar, IconTag } from "@pond/icons";
import { Button, Sidebar, Tooltip } from "@pond/ui";
import { type ReactNode, useMemo } from "react";
import { tagCreation } from "@/features/tags/state/creation";
import { useTagGroups } from "@/features/tags/state/tag-groups";
import { useTags } from "@/features/tags/state/tags";
import {
  type TagsScope,
  tagsScope,
  useTagsScope,
} from "@/features/tags/state/tags-scope";

function Row({
  scope,
  current,
  label,
  icon,
  count,
}: {
  scope: TagsScope;
  current: TagsScope;
  label: string;
  icon: ReactNode;
  count: number;
}) {
  const active = scope === current;
  return (
    <Sidebar.Item
      type="button"
      data-status={active ? "active" : undefined}
      aria-current={active ? "true" : undefined}
      onClick={() => tagsScope.set(scope)}
    >
      <Sidebar.Icon>{icon}</Sidebar.Icon>
      <Sidebar.ItemLabel>{label}</Sidebar.ItemLabel>
      {count > 0 ? (
        <Sidebar.Count>{count.toLocaleString("en-US")}</Sidebar.Count>
      ) : null}
    </Sidebar.Item>
  );
}

export function TagsSidebar() {
  const tags = useTags();
  const groups = useTagGroups();
  const scope = useTagsScope();
  const { groupCounts, ungrouped, starred } = useMemo(() => {
    const ids = new Set(tags.map((tag) => tag.id));
    const grouped = new Set<string>();
    const groupCounts = new Map<string, number>();
    for (const group of groups) {
      const members = group.tagIds.filter((id) => ids.has(id));
      for (const id of members) grouped.add(id);
      groupCounts.set(group.id, members.length);
    }
    return {
      groupCounts,
      ungrouped: tags.length - grouped.size,
      starred: tags.filter((tag) => tag.starred).length,
    };
  }, [tags, groups]);

  return (
    <>
      <Sidebar.Group>
        <Sidebar.GroupHeader>
          <Sidebar.GroupLabel>Tags</Sidebar.GroupLabel>
        </Sidebar.GroupHeader>
        <Sidebar.GroupContent aria-label="Tag Collections">
          <Row
            scope="all"
            current={scope}
            label="All"
            icon={<IconTag />}
            count={tags.length}
          />
          <Row
            scope="ungrouped"
            current={scope}
            label="Uncategorized"
            icon={<IconFolder />}
            count={ungrouped}
          />
          <Row
            scope="starred"
            current={scope}
            label="Starred"
            icon={<IconStar />}
            count={starred}
          />
        </Sidebar.GroupContent>
      </Sidebar.Group>
      <Sidebar.Group>
        <Sidebar.GroupHeader>
          <Sidebar.GroupLabel>Groups</Sidebar.GroupLabel>
          <Tooltip label="New Group" side="right">
            <Button
              icon
              variant="ghost"
              size="xs"
              aria-label="New Group"
              onClick={() => tagCreation.request("group")}
            >
              <IconPlus size={12} />
            </Button>
          </Tooltip>
        </Sidebar.GroupHeader>
        {groups.length > 0 ? (
          <Sidebar.GroupContent aria-label="Tag Groups">
            {groups.map((group) => (
              <Row
                key={group.id}
                scope={group.id}
                current={scope}
                label={group.name}
                icon={<IconFolder />}
                count={groupCounts.get(group.id) ?? 0}
              />
            ))}
          </Sidebar.GroupContent>
        ) : null}
      </Sidebar.Group>
    </>
  );
}
