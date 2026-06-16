import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import {
  DataTable,
  type DataTableColumn,
  nextSort,
  SignedValue,
} from "./table";

interface Row {
  readonly id: string;
  readonly name: string;
  readonly net: string;
  readonly roi: string;
}

const columns: readonly DataTableColumn<Row>[] = [
  {
    cell: (row) => row.name,
    header: "Name",
    id: "name",
    sortable: true,
  },
  {
    align: "right",
    cell: (row) => <SignedValue tone="money">{row.net}</SignedValue>,
    header: "Net",
    id: "net",
  },
  {
    align: "right",
    cell: (row) => row.roi,
    header: "ROI",
    id: "roi",
    priority: "desktop",
  },
];

const rows = [
  { id: "a", name: "Arena League A", net: "+$100", roi: "+10%" },
  { id: "b", name: "Arena League B", net: "-$50", roi: "-5%" },
] satisfies readonly Row[];

afterEach(() => {
  cleanup();
});

test("DataTable renders semantic table rows plus mobile card data", () => {
  render(
    <DataTable
      ariaLabel="Arena standings"
      columns={columns}
      getRowId={(row) => row.id}
      getRowName={(row) => row.name}
      rows={rows}
      selectedRowIds={["b"]}
    />,
  );

  expect(screen.getByRole("table", { name: "Arena standings" })).toBeDefined();
  expect(
    screen
      .getByRole("columnheader", { name: /Name/ })
      .getAttribute("aria-sort"),
  ).toBe("none");
  expect(screen.getAllByText("Arena League B").length).toBeGreaterThan(1);
  expect(screen.getAllByText("+$100")[0].className).toContain("lcd");
});

test("DataTable sortable headers emit the next sort direction", () => {
  const onSortChange = vi.fn();

  render(
    <DataTable
      ariaLabel="Arena standings"
      columns={columns}
      getRowId={(row) => row.id}
      getRowName={(row) => row.name}
      onSortChange={onSortChange}
      rows={rows}
      sort={{ columnId: "name", direction: "asc" }}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: /Name/ }));

  expect(onSortChange).toHaveBeenCalledWith({
    columnId: "name",
    direction: "desc",
  });
  expect(nextSort({ columnId: "name", direction: "desc" }, "name")).toBeNull();
});
