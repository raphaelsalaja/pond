import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { Db } from "../db";
import { readBundleJson, writeBundleJson } from "../lib/library-config";

const FolderRow = z.object({
  id: z.string(),
  parent_id: z.string().nullable(),
  name: z.string(),
  color: z.string().nullable(),
  sort_order: z.number(),
  created_at: z.number(),
});
const FolderMetadataRow = z.object({
  folder_id: z.string(),
  description: z.string().nullable(),
  external_link: z.string().nullable(),
});
const ViewRow = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["saved_view", "smart_folder", "group"]),
  parent_id: z.string().nullable(),
  question: z.string().nullable(),
  query: z.string(),
  sort_key: z.string(),
  sort_dir: z.string(),
  layout: z.string().nullable(),
  sort_order: z.number(),
  created_at: z.number(),
});
export const OrganizationBundleSchema = z.object({
  folders: z.array(FolderRow),
  folderMetadata: z.array(FolderMetadataRow).optional().default([]),
  views: z.array(ViewRow),
});

export function writeOrganizationBundle(db: Db, root: string): void {
  const data = OrganizationBundleSchema.parse({
    folders: db.$raw
      .prepare("select * from folders order by sort_order,id")
      .all(),
    folderMetadata: db.$raw
      .prepare("select * from folder_metadata order by folder_id")
      .all(),
    views: db.$raw
      .prepare("select * from saved_views order by sort_order,id")
      .all(),
  });
  writeBundleJson(join(root, "organization.json"), data);
}

export function hydrateOrganizationBundle(db: Db, root: string): void {
  const file = join(root, "organization.json");
  if (!existsSync(file)) {
    writeOrganizationBundle(db, root);
    return;
  }
  const envelope = readBundleJson(file);
  if (!envelope) {
    throw new Error(
      "Library organization could not be read. Restore a verified backup.",
    );
  }
  const data = OrganizationBundleSchema.parse(envelope.data);
  db.$raw.transaction(() => {
    const folder = db.$raw.prepare(
      "insert into folders (id,parent_id,name,color,sort_order,created_at) values (@id,@parent_id,@name,@color,@sort_order,@created_at) on conflict(id) do update set parent_id=excluded.parent_id,name=excluded.name,color=excluded.color,sort_order=excluded.sort_order",
    );
    for (const row of data.folders) folder.run(row);
    const metadata = db.$raw.prepare(
      "insert into folder_metadata (folder_id,description,external_link) values (@folder_id,@description,@external_link) on conflict(folder_id) do update set description=excluded.description,external_link=excluded.external_link",
    );
    for (const row of data.folderMetadata) metadata.run(row);
    const view = db.$raw.prepare(
      "insert into saved_views (id,name,kind,parent_id,question,query,sort_key,sort_dir,layout,sort_order,created_at) values (@id,@name,@kind,@parent_id,@question,@query,@sort_key,@sort_dir,@layout,@sort_order,@created_at) on conflict(id) do update set name=excluded.name,kind=excluded.kind,parent_id=excluded.parent_id,question=excluded.question,query=excluded.query,sort_key=excluded.sort_key,sort_dir=excluded.sort_dir,layout=excluded.layout,sort_order=excluded.sort_order",
    );
    for (const row of data.views) view.run(row);
    db.$raw
      .prepare(
        "delete from folder_metadata where folder_id not in (select value from json_each(?))",
      )
      .run(JSON.stringify(data.folderMetadata.map((row) => row.folder_id)));
    db.$raw
      .prepare(
        "delete from folders where id not in (select value from json_each(?))",
      )
      .run(JSON.stringify(data.folders.map((row) => row.id)));
    db.$raw
      .prepare(
        "delete from saved_views where id not in (select value from json_each(?))",
      )
      .run(JSON.stringify(data.views.map((row) => row.id)));
  })();
}
