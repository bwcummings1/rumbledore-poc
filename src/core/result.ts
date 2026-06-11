export interface AppErrorOptions {
  code: string;
  message: string;
  status?: number;
  cause?: unknown;
  details?: Record<string, unknown>;
}

export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: Record<string, unknown> | undefined;

  constructor({
    code,
    message,
    status = 500,
    cause,
    details,
  }: AppErrorOptions) {
    super(message, { cause });
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }

  toJSON() {
    return {
      code: this.code,
      details: this.details,
      message: this.message,
      status: this.status,
    };
  }
}

export type Ok<T> = {
  ok: true;
  value: T;
};

export type Err<E extends AppError = AppError> = {
  ok: false;
  error: E;
};

export type Result<T, E extends AppError = AppError> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E extends AppError>(error: E): Err<E> {
  return { ok: false, error };
}

export function isOk<T, E extends AppError>(
  result: Result<T, E>,
): result is Ok<T> {
  return result.ok;
}

export function isErr<T, E extends AppError>(
  result: Result<T, E>,
): result is Err<E> {
  return !result.ok;
}

export function unwrap<T, E extends AppError>(result: Result<T, E>): T {
  if (result.ok) {
    return result.value;
  }
  throw result.error;
}

export function toAppError(
  error: unknown,
  fallback: Partial<Pick<AppErrorOptions, "code" | "message" | "status">> = {},
): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    return new AppError({
      code: fallback.code ?? "INTERNAL_ERROR",
      message: fallback.message ?? error.message,
      status: fallback.status ?? 500,
      cause: error,
    });
  }

  return new AppError({
    code: fallback.code ?? "INTERNAL_ERROR",
    message: fallback.message ?? "Unknown error",
    status: fallback.status ?? 500,
    cause: error,
  });
}
