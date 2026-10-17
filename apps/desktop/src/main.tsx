import "./app.css";

import { createRoot } from "react-dom/client";

async function boot() {
  // Outside Tauri (plain browser preview, `pnpm dev`), use the in-memory
  // backend with example data. This branch is removed from release builds.
  if (import.meta.env.DEV && !("__TAURI_INTERNALS__" in window)) {
    const { installMockBackend } = await import("@mousecomb/data/testing");
    const { exampleItems } = await import("./dev/examples");
    installMockBackend({ seed: exampleItems() });
  }
  const { App } = await import("./App");
  createRoot(document.getElementById("root")!).render(<App />);
}

void boot();
