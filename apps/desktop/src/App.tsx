import { events } from "@mousecomb/bindings";
import { connectBackendEvents, useBackendEvent } from "@mousecomb/data";
import { Toaster } from "@mousecomb/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { useEffect } from "react";

import { isSettingsPage, router } from "./router";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

export function App() {
  // Rust pushes account, sync, timer and update changes; keep the query cache current.
  useEffect(() => connectBackendEvents(queryClient), []);

  // The OmniBar asks the Settings window to open a page; Rust sends it to that window only.
  useBackendEvent(
    events.navigateRequested,
    ({ to }) => {
      if (isSettingsPage(to)) void router.navigate({ to });
    },
    "this-window",
  );

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} context={{ queryClient }} />
      <Toaster />
    </QueryClientProvider>
  );
}
