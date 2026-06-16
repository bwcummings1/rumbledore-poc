import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { DataCardTable } from "./data-card-table";

test("DataCardTable renders mobile card rows with all key-value cells", () => {
  render(
    <DataCardTable
      label="Mobile standings"
      rows={[
        {
          cells: [
            { label: "Net", tone: "money", value: "+$300" },
            { label: "ROI", tone: "positive", value: "+30%" },
          ],
          id: "row-1",
          selected: true,
          title: "Arena League B",
        },
      ]}
    />,
  );

  expect(screen.getByRole("list", { name: "Mobile standings" })).toBeDefined();
  expect(
    screen.getByRole("listitem", { name: "Arena League B" }),
  ).toBeDefined();
  expect(screen.getByText("+$300").className).toContain("lcd");
});
