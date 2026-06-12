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

export async function readJsonBody(
  request: Request,
  maxBytes = DEFAULT_MAX_JSON_BYTES,
): Promise<Result<unknown, AppError>> {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const bytes = Number(contentLength);
    if (Number.isFinite(bytes) && bytes > maxBytes) {
      return err(
        new AppError({
          code: "REQUEST_BODY_TOO_LARGE",
          message: "Request body is too large",
          status: 413,
        }),
      );
    }
  }

  try {
    return ok(await request.json());
  } catch {
    return ok({});
  }
}
