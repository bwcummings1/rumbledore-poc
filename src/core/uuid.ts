import { AppError } from "@/core/result";

/**
 * Postgres raises `22P02 invalid input syntax for type uuid` when a malformed
 * literal is compared against a uuid column. A route that hands a path param
 * straight to a query therefore answers a client's typo with a 500 — a caller
 * error reported as a server fault, and one that pollutes the error-rate metric
 * that is supposed to signal real breakage.
 *
 * This mirrors the `INVALID_LEAGUE_ID` guard in `src/auth/guards.ts`: same
 * pattern, same `AppError` shape, same 400. It exists separately only because
 * that one is typed and named for league ids specifically; `isValidLeagueId`
 * should collapse onto `isUuid` once the guard module is free to change.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Returns the 400 to send when `value` is not a uuid, or `null` when the caller
 * may proceed. Returning the error rather than a boolean keeps the call site
 * from validating and then forgetting to act on the result.
 *
 * `label` is fixed route copy, never the offending value: echoing an unvalidated
 * path segment back into a response body is how a reflection bug starts.
 */
export function uuidParamError(
  value: string,
  { code, label }: { code: string; label: string },
): AppError | null {
  if (isUuid(value)) {
    return null;
  }

  return new AppError({
    code,
    message: `${label} must be a UUID`,
    status: 400,
  });
}
