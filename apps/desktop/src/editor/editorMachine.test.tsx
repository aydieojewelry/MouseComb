// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { useMachine } from "@zag-js/react";
import { afterEach, describe, expect, it } from "vitest";

import { type EditorPhase, editorMachine } from "./editorMachine";

const PHASES: EditorPhase[] = ["idle", "editing", "persisting", "synced", "error"];

/**
 * Mounts the machine and returns a `send` that waits for Zag to apply the
 * event, then reads the phase from the rendered output. Zag applies events
 * asynchronously, so reading the state right after `send` would be stale.
 */
function mountMachine() {
  const holder: { send: ((type: string) => void) | null } = { send: null };
  function Harness() {
    const service = useMachine(editorMachine);
    holder.send = (type) => service.send({ type } as never);
    const phase = PHASES.find((p) => service.state.matches(p)) ?? "none";
    return <p data-testid="phase">{phase}</p>;
  }
  render(<Harness />);
  const send = async (type: string) => {
    await act(async () => {
      holder.send?.(type);
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    return screen.getByTestId("phase").textContent;
  };
  return { send };
}

describe("editor save states", () => {
  afterEach(() => cleanup());

  it("goes idle → editing → persisting → synced, and back to editing on new typing", async () => {
    const { send } = mountMachine();
    expect(screen.getByTestId("phase").textContent).toBe("idle");
    expect(await send("TYPE")).toBe("editing");
    expect(await send("SAVE")).toBe("persisting");
    expect(await send("SAVED")).toBe("synced");
    expect(await send("TYPE")).toBe("editing");
  });

  it("shows a refused save as an error, and a retry starts saving again", async () => {
    const { send } = mountMachine();
    await send("TYPE");
    await send("SAVE");
    expect(await send("FAILED")).toBe("error");
    expect(await send("SAVE")).toBe("persisting");
  });

  it("a reload starts clean from any state", async () => {
    const { send } = mountMachine();
    await send("TYPE");
    await send("SAVE");
    await send("FAILED");
    expect(await send("LOADED")).toBe("idle");
  });
});
