import type { CommandError, ErrorCode } from "@mousecomb/bindings";

/** A failed Rust command, thrown so TanStack Query and Form can catch it. */
export class AppError extends Error {
  readonly code: ErrorCode;

  constructor(error: CommandError) {
    super(error.message);
    this.name = "AppError";
    this.code = error.code;
  }
}

type Result<T> = { status: "ok"; data: T } | { status: "error"; error: CommandError };

/** Turn a typed command result into a value, or throw an {@link AppError}. */
export async function unwrap<T>(result: Promise<Result<T>>): Promise<T> {
  const r = await result;
  if (r.status === "error") throw new AppError(r.error);
  return r.data;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}
