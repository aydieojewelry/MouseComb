# My App-Building Intents

The app-builder skill reads this file before planning any app, new or
rebuilt. These are my defaults; anything I say for a specific project
overrides them. The builder adds to this file only with my OK (see
"How this file grows" at the bottom).

## Platforms

- Ship to **Android, iOS, Web and Desktop** unless I say otherwise.
- One codebase for all of them wherever possible.

## Default stack

- **React Native with Expo and TypeScript**, using Expo Router.
- Web through Expo's web target (react-native-web).
- Desktop: wrap the web build with Tauri (small installers, low memory)
  unless the app needs native desktop APIs; then propose an alternative.
- Keep dependencies few. Before adding a library, check whether Expo or
  the platform already does it.

## Design

- **Platform-native or minimal and clean.** Follow Material 3 on Android
  and Apple's Human Interface Guidelines on iOS; keep screens uncluttered
  with generous spacing and a small color palette.
- All brand values (colors, fonts, logo, app name) live in one theme
  module, driven by `brand/brand.json`, so rebranding is a one-file change.
- Light and dark mode from day one.
- Accessible by default: readable contrast, dynamic text sizes, labels on
  every control, touch targets of at least 44pt/48dp.

## Monetization

- **Decided per project.** Ask me at the planning step which model this
  app uses (free, subscription, one-time purchase, selling my products,
  or something else). Write no monetization code until I answer.

## Always include

- Fast startup and small download size; report both at the end of a build.
- Offline-friendly behavior where it makes sense, with clear error and
  empty states.
- A README with build, run and release steps for every platform.
- Tests for the core user flows.

## Never include

- Ads, trackers or third-party analytics unless I ask for them for a
  specific app.
- Permissions that no kept feature needs.
- Code, assets, names or trademarks copied from a reference app.

## Best practices I've learned

<!-- The builder appends dated one-line lessons here, with my OK. -->

## App ideas backlog

<!-- The builder appends app ideas I mention, one line each, with the date. -->

## How this file grows

- When I state a preference that should apply to future apps ("always…",
  "never…", "from now on…"), the builder proposes a one-line addition
  under the right heading and adds it once I agree.
- When I mention an idea for a future app, it goes in the ideas backlog.
- At the end of each build, the builder asks if anything from that build
  should be remembered.
- Never store passwords, API keys or other secrets here.
