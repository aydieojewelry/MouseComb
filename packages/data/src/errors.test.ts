import { describe, expect, it } from "vitest";

import { AppError, errorMessage, unwrap } from "./errors";

describe("AppError", () => {
  it("keeps typed errors from Rust", () => {
    const e = new AppError({ code: "network", message: "Can't reach the sync server." });
    expect([e.code, e.message]).toEqual(["network", "Can't reach the sync server."]);
  });

  it("explains failures Tauri reports as plain strings, never an empty message", async () => {
    const tauri = Promise.resolve({ status: "error" as const, error: "state not managed" as never });
    await expect(unwrap(tauri)).rejects.toMatchObject({ code: "system", message: "state not managed" });
    expect(new AppError(undefined).message).not.toBe("");
    expect(errorMessage("plain text")).toBe("plain text");
  });
});
