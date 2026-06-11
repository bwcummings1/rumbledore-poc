import { describe, expect, it } from "vitest";
import { AppError, err, isErr, isOk, ok, toAppError, unwrap } from "./result";

describe("Result helpers", () => {
  it("wraps success and failure values with narrowable discriminants", () => {
    const success = ok({ id: "league-1" });
    const failure = err(
      new AppError({
        code: "NOT_FOUND",
        message: "League not found",
        status: 404,
      }),
    );

    expect(isOk(success)).toBe(true);
    expect(isErr(failure)).toBe(true);
    expect(success.value.id).toBe("league-1");
    expect(failure.error.code).toBe("NOT_FOUND");
  });

  it("unwraps successes and throws typed app errors for failures", () => {
    const appError = new AppError({
      code: "AUTH_REQUIRED",
      message: "Sign in required",
      status: 401,
    });

    expect(unwrap(ok("ready"))).toBe("ready");
    expect(() => unwrap(err(appError))).toThrow(appError);
  });

  it("normalizes unknown errors without losing the original cause", () => {
    const cause = new Error("socket closed");
    const appError = toAppError(cause, {
      code: "DEPENDENCY_DOWN",
      status: 503,
    });

    expect(appError).toMatchObject({
      code: "DEPENDENCY_DOWN",
      message: "socket closed",
      status: 503,
    });
    expect(appError.cause).toBe(cause);
  });
});
