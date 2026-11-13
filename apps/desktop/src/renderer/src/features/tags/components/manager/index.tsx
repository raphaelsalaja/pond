import { IconTagFill, IconMagnifier as Magnifier } from "@pond/icons";
import { Accordion, Button, Empty, Input, Settings } from "@pond/ui";
import { DataTable } from "@pond/ui/data-table";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useMemo, useRef } from "react";
import { useTagCreation } from "@/features/tags/hooks/use-tag-creation";
import { MatchesEmpty } from "@/shared/components/matches-empty";
import { gentleSpring } from "@/shared/lib/motion";
import { useTagsData } from "../../hooks/use-tag-manager";
import { TagsBulkActionBar } from "./bulk-actions";
import { DraftRow } from "./draft-row";
import { TagGroup } from "./group";
import { TagItem } from "./item";
import { tagsColumns } from "./lib/columns";
import { TagsTableContext } from "./lib/context";
import type { TagsRowData } from "./lib/types";
import styles from "./styles.module.css";

export function TagsSection() {
  const {
    q,
    setQ,
    data,
    expandedIds,
    onToggleExpand,
    namesFromIds,
    groupOptions,
    total,
  } = useTagsData();

  const { creating, startCreate, cancelCreate, saveCreate } = useTagCreation();
  const clearRef = useRef<() => void>(() => {});
  const ctxValue = useMemo(
    () => ({
      groups: groupOptions,
      tags: [
        ...new Set(
          data.flatMap((row) =>
            row.kind === "tag"
              ? [row.tag.name]
              : row.children.flatMap((child) =>
                  child.kind === "tag" ? [child.tag.name] : [],
                ),
          ),
        ),
      ],
    }),
    [data, groupOptions],
  );
  const onSelectionChange = useCallback(() => {}, []);
  const reduceMotion = useReducedMotion();
  const motionTransition = reduceMotion ? { duration: 0 } : gentleSpring;

  const groups = data.filter(
    (row): row is Extract<TagsRowData, { kind: "group" }> =>
      row.kind === "group",
  );
  const ungrouped = data.filter(
    (row): row is Extract<TagsRowData, { kind: "tag" }> => row.kind === "tag",
  );

  const hasList = creating != null || groups.length > 0 || ungrouped.length > 0;

  return (
    <DataTable.Provider
      data={data}
      columns={tagsColumns}
      getRowId={(row) => row.id}
      getSubRows={(row) => (row.kind === "group" ? row.children : undefined)}
      expandCaret={false}
      onSelectionChange={onSelectionChange}
      defaultSort={{ id: "name", desc: false }}
      expandedIds={expandedIds}
      onToggleExpand={onToggleExpand}
    >
      <Settings.Page>
        <Settings.Header>
          <Settings.HeaderText>
            <Settings.Title>Tags</Settings.Title>
            <Settings.Description>
              Organize saves with tags and groups.
            </Settings.Description>
          </Settings.HeaderText>
        </Settings.Header>

        <div className={styles.content}>
          <DataTable.Toolbar className={styles.toolbar}>
            <Input.Root className={styles.search}>
              <Input.Icon>
                <Magnifier size={12} />
              </Input.Icon>
              <Input.Field
                value={q}
                onChange={(e) => setQ(e.target.value)}
                spellCheck={false}
                placeholder="Search…"
              />
            </Input.Root>
            <div className={styles.spacer} />
            <Button variant="secondary" onClick={() => startCreate("group")}>
              New Group
            </Button>
            {hasList ? (
              <Button variant="secondary" onClick={() => startCreate("tag")}>
                New Tag
              </Button>
            ) : null}
          </DataTable.Toolbar>

          <TagsTableContext value={ctxValue}>
            {hasList ? (
              <div className={styles.list}>
                <AnimatePresence initial={false}>
                  {creating ? (
                    <motion.div
                      key="draft"
                      className={styles.draft}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={motionTransition}
                    >
                      <DraftRow
                        creating={creating}
                        onSave={saveCreate}
                        onFinish={cancelCreate}
                      />
                    </motion.div>
                  ) : null}
                </AnimatePresence>
                {groups.length > 0 ? (
                  <Accordion.Root
                    multiple
                    value={expandedIds}
                    onValueChange={(next) => {
                      const open = new Set(next);
                      for (const group of groups) {
                        const was = expandedIds.includes(group.id);
                        const now = open.has(group.id);
                        if (was !== now) onToggleExpand(group.id, now);
                      }
                    }}
                    className={styles.groups}
                  >
                    {groups.map((group) => (
                      <TagGroup
                        key={group.id}
                        row={group}
                        open={expandedIds.includes(group.id)}
                      />
                    ))}
                  </Accordion.Root>
                ) : null}
                {ungrouped.map((row) => (
                  <TagItem key={row.id} row={row} variant="card" />
                ))}
              </div>
            ) : total === 0 ? (
              <Empty.Root>
                <Empty.Media>
                  <IconTagFill size={32} />
                </Empty.Media>
                <Empty.Title>No tags yet</Empty.Title>
                <Empty.Description>
                  Create your first tag to start organizing your library.
                </Empty.Description>
                <Empty.Action>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => startCreate("tag")}
                  >
                    New Tag
                  </Button>
                </Empty.Action>
              </Empty.Root>
            ) : (
              <MatchesEmpty
                actionLabel="Clear Search"
                description="Try a different tag name."
                onReset={() => setQ("")}
              />
            )}
          </TagsTableContext>
        </div>
      </Settings.Page>

      <TagsBulkActionBar namesFromIds={namesFromIds} clearRef={clearRef} />
    </DataTable.Provider>
  );
}
