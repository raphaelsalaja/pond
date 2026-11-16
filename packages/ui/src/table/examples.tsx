import type { ComponentDocs } from "../shared/docs";
import { Table } from ".";

const sources = [
  { name: "Are.na", saves: "248", synced: "Today" },
  { name: "Pinterest", saves: "1,024", synced: "Yesterday" },
  { name: "YouTube", saves: "87", synced: "Mar 2" },
];

export const docs: ComponentDocs = {
  slug: "table",
  name: "Table",
  tier: "content",
  summary:
    "Styles a native table for short, static data. Use `DataTable` for sorting, selection or many rows.",
  parts: [
    {
      name: "Table.Root",
      description:
        "The `<table>` inside a horizontal scroll wrapper. `className` styles the table and `containerClassName` styles the wrapper.",
    },
    { name: "Table.Caption", description: "Names the table." },
    { name: "Table.Header", description: "The `<thead>`." },
    { name: "Table.Body", description: "The `<tbody>`." },
    { name: "Table.Footer", description: "The `<tfoot>`." },
    { name: "Table.Row", description: "A `<tr>`." },
    { name: "Table.Head", description: "A header cell (`<th>`). Set `scope`." },
    { name: "Table.Cell", description: "A data cell (`<td>`)." },
  ],
  keyboard: [],
  accessibility: [
    "Native table semantics. Screen readers announce rows, columns and headers.",
    "Name the table with `Caption`, or with `aria-label` on `Root`.",
    'Set `scope="col"` or `scope="row"` on each `Head`.',
  ],
  examples: [
    {
      name: "Sources",
      render: () => (
        <Table.Root>
          <Table.Caption>Sources</Table.Caption>
          <Table.Header>
            <Table.Row>
              <Table.Head scope="col">Source</Table.Head>
              <Table.Head scope="col">Saves</Table.Head>
              <Table.Head scope="col">Last Synced</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {sources.map((source) => (
              <Table.Row key={source.name}>
                <Table.Cell>{source.name}</Table.Cell>
                <Table.Cell>{source.saves}</Table.Cell>
                <Table.Cell>{source.synced}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      ),
    },
  ],
};
