import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { KVList, KVRow } from "./kv";

test("KVList renders semantic definition rows with toned values", () => {
  render(
    <KVList>
      <KVRow label="Bankroll" tone="money" value="$10,000" />
      <KVRow label="Delta" tone="positive" value="+$250" />
    </KVList>,
  );

  expect(screen.getByText("Bankroll").tagName).toBe("DT");
  expect(screen.getByText("$10,000").tagName).toBe("DD");
  expect(screen.getByText("$10,000").className).toContain("lcd");
  expect(screen.getByText("+$250").className).toContain("text-positive");
});
