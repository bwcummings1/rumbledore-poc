import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { Avatar, AvatarGroup, monogram } from "./avatar";

test("Avatar renders deterministic monogram fallback when no image exists", () => {
  render(<Avatar name="Arena League B" />);

  expect(monogram("Arena League B")).toBe("AB");
  expect(screen.getByLabelText("Arena League B")).toBeDefined();
  expect(screen.getByText("AB")).toBeDefined();
});

test("AvatarGroup caps visible avatars and exposes overflow count", () => {
  render(
    <AvatarGroup
      avatars={[
        { name: "One" },
        { name: "Two" },
        { name: "Three" },
        { name: "Four" },
      ]}
      max={2}
    />,
  );

  expect(screen.getByText("4 avatars")).toBeDefined();
  expect(screen.getByText("2 more avatars")).toBeDefined();
});
