// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isUuid, uuidParamError } from "./uuid";

const VALID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

describe("uuid path params", () => {
  it("accepts a canonical uuid in either case", () => {
    expect(isUuid(VALID)).toBe(true);
    expect(isUuid(VALID.toUpperCase())).toBe(true);
  });

  it.each([
    ["empty", ""],
    ["not hex", "zzzzzzzz-4f89-41d3-9a0c-0305e82c3301"],
    ["missing a group", "3f2504e0-4f89-41d3-9a0c"],
    ["unhyphenated", "3f2504e04f8941d39a0c0305e82c3301"],
    ["trailing text", `${VALID}x`],
    ["leading whitespace", ` ${VALID}`],
    ["sql-ish payload", "1' or '1'='1"],
  ])("rejects %s", (_label, value) => {
    expect(isUuid(value)).toBe(false);
  });

  it("rejects a newline-padded uuid", () => {
    // Pins the anchor semantics: `$` here must mean end-of-input, not
    // end-of-line. A stray `m` flag would let this through to Postgres.
    expect(isUuid(`${VALID}\n`)).toBe(false);
  });

  it("returns no error for a valid uuid", () => {
    expect(
      uuidParamError(VALID, { code: "INVALID_POST_ID", label: "Post id" }),
    ).toBeNull();
  });

  it("returns a 400 AppError matching the league-id guard shape", () => {
    const error = uuidParamError("not-a-uuid", {
      code: "INVALID_POST_ID",
      label: "Post id",
    });

    expect(error?.status).toBe(400);
    expect(error?.code).toBe("INVALID_POST_ID");
    expect(error?.message).toBe("Post id must be a UUID");
  });

  it("never echoes the rejected value back to the caller", () => {
    const error = uuidParamError("<script>alert(1)</script>", {
      code: "INVALID_POST_ID",
      label: "Post id",
    });

    expect(JSON.stringify(error?.toJSON())).not.toContain("script");
  });
});
