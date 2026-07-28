import { NextResponse } from "next/server";
import { requireSession } from "@/auth/guards";
import { AppError, err, ok, type Result } from "@/core/result";

const DEFAULT_MAX_JSON_BYTES = 4096;

export async function requireUserId(
  request: Request,
): Promise<Result<string, AppError>> {
  const session = await requireSession({ headers: request.headers });
  if (!session.ok) {
    return session;
  }
  return ok(session.value.userId);
}

export function errorJson(error: AppError): NextResponse {
  return NextResponse.json({ error: error.toJSON() }, { status: error.status });
}

export function okJson<T>(value: T, status = 200): NextResponse {
  return NextResponse.json(value, {
    headers: { "Cache-Control": "no-store" },
    status,
  });
}

export function resultJson<T>(
  result: Result<T, AppError>,
  status = 200,
): NextResponse {
  return result.ok ? okJson(result.value, status) : errorJson(result.error);
}

function bodyTooLarge(): AppError {
  return new AppError({
    code: "REQUEST_BODY_TOO_LARGE",
    message: "Request body is too large",
    status: 413,
  });
}

/**
 * Reads at most `maxBytes` from the request stream, aborting as soon as the cap
 * is exceeded.
 *
 * The cap is enforced on bytes actually read rather than on `Content-Length`,
 * because that header is optional: a `Transfer-Encoding: chunked` request omits
 * it entirely and would otherwise skip the check and buffer without limit.
 */
async function readBoundedBody(
  request: Request,
  maxBytes: number,
): Promise<Result<string, AppError>> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    return err(bodyTooLarge());
  }

  const stream = request.body;
  if (!stream) {
    return ok("");
  }

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value) {
        continue;
      }
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return err(bodyTooLarge());
      }
      chunks.push(value);
    }
  } catch {
    return err(
      new AppError({
        code: "REQUEST_BODY_UNREADABLE",
        message: "Request body could not be read",
        status: 400,
      }),
    );
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return ok(new TextDecoder().decode(merged));
}

/**
 * Parses a JSON request body under a byte cap.
 *
 * An ABSENT body yields `{}` — several handlers legitimately take no payload
 * and rely on all-optional schemas. A PRESENT but unparseable body is a 400.
 *
 * That distinction is the point. This previously returned `ok({})` for any
 * parse failure, so a corrupt payload became a SUCCESSFUL empty request: on a
 * route whose schema is all-optional it validated and the handler ran its
 * default branch. Two concrete consequences were a destructive Data Book
 * checkpoint restore executing on a body the server could not read, and a
 * body-less DELETE to the account push route disabling every subscription the
 * user had in every league.
 */
export async function readJsonBody(
  request: Request,
  maxBytes = DEFAULT_MAX_JSON_BYTES,
): Promise<Result<unknown, AppError>> {
  const body = await readBoundedBody(request, maxBytes);
  if (!body.ok) {
    return body;
  }

  if (!body.value.trim()) {
    return ok({});
  }

  try {
    return ok(JSON.parse(body.value));
  } catch (error) {
    return err(
      new AppError({
        cause: error,
        code: "REQUEST_BODY_INVALID_JSON",
        message: "Request body is not valid JSON",
        status: 400,
      }),
    );
  }
}
