import "./app.css";

import { createRoot } from "react-dom/client";

/** Which window this is, for window-specific styles (the HUD and OmniBar are see-through). */
function windowKind(hash: string): "hud" | "omnibar" | "main" {
  if (hash.startsWith("#/hud")) return "hud";
  if (hash.startsWith("#/omnibar")) return "omnibar";
  return "main";
}

async function boot() {
  document.documentElement.dataset.window = windowKind(window.location.hash);
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
