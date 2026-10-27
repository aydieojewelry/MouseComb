/**
 * The editor's save states (FEAT-030), as a Zag.js machine:
 *   idle → editing → persisting → synced | error
 * Validation happens in the service: a refused save comes back as `error`.
 */
import { createMachine } from "@zag-js/core";

export type EditorPhase = "idle" | "editing" | "persisting" | "synced" | "error";

export interface EditorSchema {
  state: EditorPhase;
  event: { type: "LOADED" } | { type: "TYPE" } | { type: "SAVE" } | { type: "SAVED" } | { type: "FAILED" };
}

export const editorMachine = createMachine<EditorSchema>({
  initialState() {
    return "idle";
  },
  // A file is (re)loaded from disk: whatever state we were in, start clean.
  on: {
    LOADED: { target: "idle" },
  },
  states: {
    idle: {
      on: { TYPE: { target: "editing" } },
    },
    editing: {
      on: {
        TYPE: { target: "editing" },
        SAVE: { target: "persisting" },
      },
    },
    persisting: {
      on: {
        SAVED: { target: "synced" },
        FAILED: { target: "error" },
      },
    },
    synced: {
      on: { TYPE: { target: "editing" } },
    },
    error: {
      on: {
        TYPE: { target: "editing" },
        SAVE: { target: "persisting" },
      },
    },
  },
});
