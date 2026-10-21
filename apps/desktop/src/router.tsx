import { accountQuery, LOCAL_SETTINGS, localSettingQuery } from "@mousecomb/data";
import type { QueryClient } from "@tanstack/react-query";
import {
  createHashHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { z } from "zod";

import { ErrorPage } from "./components/ErrorPage";

// Each window loads only the code for its own route.
const page = {
  shell: lazyRouteComponent(() => import("./components/Shell"), "Shell"),
  hud: lazyRouteComponent(() => import("./hud/HudPage"), "HudPage"),
  omnibar: lazyRouteComponent(() => import("./omnibar/OmniBarPage"), "OmniBarPage"),
  welcome: lazyRouteComponent(() => import("./pages/WelcomePage"), "WelcomePage"),
  general: lazyRouteComponent(() => import("./pages/GeneralPage"), "GeneralPage"),
  pomodoro: lazyRouteComponent(() => import("./pages/PomodoroPage"), "PomodoroPage"),
  bindings: lazyRouteComponent(() => import("./pages/BindingsPage"), "BindingsPage"),
  snippets: lazyRouteComponent(() => import("./pages/SnippetsPage"), "SnippetsPage"),
  account: lazyRouteComponent(() => import("./pages/AccountPage"), "AccountPage"),
  about: lazyRouteComponent(() => import("./pages/AboutPage"), "AboutPage"),
};

// Each window loads the same app on its own route: `main` shows Settings
// (or Welcome on first launch), `omnibar` and `hud` their own (APP_SPEC §4).
const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({ component: Outlet });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: async ({ context }) => {
    const [done, account] = await Promise.all([
      context.queryClient.ensureQueryData(localSettingQuery(LOCAL_SETTINGS.onboardingDone)),
      context.queryClient.ensureQueryData(accountQuery),
    ]);
    throw redirect({ to: done || account ? "/general" : "/welcome" });
  },
});

const welcomeRoute = createRoute({ getParentRoute: () => rootRoute, path: "welcome", component: page.welcome });
const omnibarRoute = createRoute({ getParentRoute: () => rootRoute, path: "omnibar", component: page.omnibar });
const hudRoute = createRoute({ getParentRoute: () => rootRoute, path: "hud", component: page.hud });

/** The Settings window: sidebar + one page. */
const settingsRoute = createRoute({ getParentRoute: () => rootRoute, id: "_settings", component: page.shell });

const generalRoute = createRoute({ getParentRoute: () => settingsRoute, path: "general", component: page.general });
const pomodoroRoute = createRoute({ getParentRoute: () => settingsRoute, path: "pomodoro", component: page.pomodoro });
const bindingsRoute = createRoute({ getParentRoute: () => settingsRoute, path: "bindings", component: page.bindings });

export const snippetsSearch = z.object({
  /** Search text. */
  q: z.string().optional(),
  /** Selected snippet id, or "new". */
  id: z.string().optional(),
});

const snippetsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "snippets",
  validateSearch: snippetsSearch,
  component: page.snippets,
});

const accountRoute = createRoute({ getParentRoute: () => settingsRoute, path: "account", component: page.account });
const aboutRoute = createRoute({ getParentRoute: () => settingsRoute, path: "about", component: page.about });

const routeTree = rootRoute.addChildren([
  indexRoute,
  welcomeRoute,
  omnibarRoute,
  hudRoute,
  settingsRoute.addChildren([generalRoute, pomodoroRoute, bindingsRoute, snippetsRoute, accountRoute, aboutRoute]),
]);

// Hash history: every window loads index.html, whatever the route.
export const router = createRouter({
  routeTree,
  history: createHashHistory(),
  defaultPreload: "intent",
  defaultErrorComponent: ErrorPage,
  context: { queryClient: undefined! },
});

/** Settings pages Rust may ask the main window to show (`mc.settings.open`). */
export const SETTINGS_PAGES = ["/general", "/pomodoro", "/bindings", "/snippets", "/account", "/about"] as const;
export type SettingsPage = (typeof SETTINGS_PAGES)[number];

export function isSettingsPage(path: string): path is SettingsPage {
  return (SETTINGS_PAGES as readonly string[]).includes(path);
}

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
