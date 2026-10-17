import { events } from "@mousecomb/bindings";
import { connectBackendEvents } from "@mousecomb/data";
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

  // The OmniBar asks the Settings window to open a page. Events reach every
  // window, so only the Settings window follows it.
  useEffect(() => {
    if (document.documentElement.dataset.window !== "main") return;
    const stop = events.navigateRequested.listen((e) => {
      if (isSettingsPage(e.payload.to)) void router.navigate({ to: e.payload.to });
    });
    return () => void stop.then((f) => f());
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} context={{ queryClient }} />
      <Toaster />
    </QueryClientProvider>
  );
}
