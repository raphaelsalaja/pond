export async function importMymindExport(): Promise<void> {
  const { importMymind, runNewAction } = await import(
    "@/features/library/import"
  );
  await runNewAction(importMymind);
}
