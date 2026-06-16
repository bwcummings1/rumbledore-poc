import { render, screen } from "@testing-library/react";
import { Trophy } from "lucide-react";
import { expect, test } from "vitest";

import { Tag } from "./tag";

test("Tag renders a static classification label with optional glyph", () => {
  render(<Tag leadingIcon={<Trophy aria-hidden="true" />}>Arena</Tag>);

  const tag = screen.getByText("Arena").closest("[data-slot='tag']");
  expect(tag).toBeDefined();
  expect(tag?.querySelector("svg")).toBeDefined();
});
