import { createHashHistory, createRootRoute, createRoute, createRouter, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { Shell } from "./components/Shell";
import { AboutPage } from "./pages/AboutPage";
import { AccountPage } from "./pages/AccountPage";
import { GeneralPage } from "./pages/GeneralPage";
import { SnippetsPage } from "./pages/SnippetsPage";

const rootRoute = createRootRoute({ component: Shell });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/general" });
  },
});

const generalRoute = createRoute({ getParentRoute: () => rootRoute, path: "general", component: GeneralPage });

export const snippetsSearch = z.object({
  /** Search text. */
  q: z.string().optional(),
  /** Selected snippet id, or "new". */
  id: z.string().optional(),
});

const snippetsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "snippets",
  validateSearch: snippetsSearch,
  component: SnippetsPage,
});

const accountRoute = createRoute({ getParentRoute: () => rootRoute, path: "account", component: AccountPage });
const aboutRoute = createRoute({ getParentRoute: () => rootRoute, path: "about", component: AboutPage });

const routeTree = rootRoute.addChildren([indexRoute, generalRoute, snippetsRoute, accountRoute, aboutRoute]);

// Hash history: every window loads index.html, whatever the route.
export const router = createRouter({ routeTree, history: createHashHistory(), defaultPreload: "intent" });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
