import type { CommandError, ErrorCode } from "@mousecomb/bindings";

/** A failed Rust command, thrown so TanStack Query and Form can catch it. */
export class AppError extends Error {
  readonly code: ErrorCode;

  /** `error` is our typed error, or what Tauri itself rejected with (usually a string). */
  constructor(error: CommandError | unknown) {
    const typed = isCommandError(error);
    super(typed ? error.message : typeof error === "string" && error ? error : "MouseComb's core didn't answer.");
    this.name = "AppError";
    this.code = typed ? error.code : "system";
  }
}

function isCommandError(e: unknown): e is CommandError {
  return typeof e === "object" && e !== null && typeof (e as CommandError).message === "string" && "code" in e;
}

type Result<T> = { status: "ok"; data: T } | { status: "error"; error: CommandError };

/** Turn a typed command result into a value, or throw an {@link AppError}. */
export async function unwrap<T>(result: Promise<Result<T>>): Promise<T> {
  const r = await result;
  if (r.status === "error") throw new AppError(r.error);
  return r.data;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "Something went wrong.";
}
