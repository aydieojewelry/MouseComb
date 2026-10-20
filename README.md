# MouseComb

A kit that turns Claude Code into your personal app builder. Describe a new
app, or drop in a reference app and Claude uses
[REA](https://github.com/morluto/rea) to map its features, lets you pick
what to keep, then builds a new, debloated app with your branding. Every
build follows your saved intents in [`profile/INTENTS.md`](profile/INTENTS.md),
which grow as you share new preferences and ideas.

## Install (global, once per machine)

Needs Node.js 22.19+ and Claude Code.

```bash
git clone https://github.com/aydieojewelry/MouseComb.git
cd MouseComb
./install.sh
```

This registers REA's MCP server in your user-level Claude Code config
(`~/.claude.json`, backed up first), installs two skills into
`~/.claude/skills/` (REA's `reverse-engineer-anything` and this repo's
`app-builder`), and links `~/.claude/app-builder/INTENTS.md` to
`profile/INTENTS.md` in this clone. Restart Claude Code afterwards. Every
project on the machine then has them.

For Claude Code on the web, add this to your cloud environment's setup
script so each new session gets the same tools:

```bash
git clone --depth 1 https://github.com/aydieojewelry/MouseComb.git /tmp/mousecomb && /tmp/mousecomb/install.sh --yes
```

## Use

**Rebuild from a reference app.** In an empty project folder:

1. Put the reference app in `reference/` (APK/AAB, IPA, `.app`, `.exe`,
   an Electron app, a web bundle), or have its URL ready.
2. Fill in `brand/brand.json` (Claude creates it from
   [the template](.claude/skills/app-builder/brand.example.json)) and drop
   your logo, icon and fonts in `brand/assets/`.
3. Ask Claude Code: *"Rebuild the app in reference/ with my brand."*

**Build a new app.** Ask: *"Build me an app that…"* with your brand files
in place.

Claude will:

1. load your intents (platforms, stack, design, rules);
2. for a rebuild, ask whether you own the app, it's open source, or it's
   third-party;
3. check the analysis tools this app type needs and ask you to install
   any that are missing (see [dependencies](.claude/skills/app-builder/references/dependencies.md));
4. map the reference app's features, SDKs, permissions and bloat with REA
   into `spec/inventory.md`;
5. propose a plan in `spec/plan.md`, ask how this app makes money, and
   wait for your OK;
6. write the app in `app/` with your brand, then build, test and report;
7. ask what to remember from the build and add it to your intents.

### What each reference app needs

| Reference app | Install first |
|---|---|
| Web, PWA, Electron, JavaScript | Nothing |
| Android APK/AAB | JDK 17+ and the JADX MCP JAR 0.7.1 |
| iOS / macOS apps | A Mac with Xcode command line tools |
| Native binaries | Ghidra 12.1.x (free), Hopper or IDA |

Claude walks you through these when a reference app needs them.

## Your intents

[`profile/INTENTS.md`](profile/INTENTS.md) holds your defaults: platforms,
stack (React Native + Expo), design (platform-native, minimal), the
per-project monetization rule, always/never lists, learned best practices
and an app ideas backlog. Edit it any time. When you tell Claude a new
preference or app idea, it offers to add it there; commit and push
MouseComb to sync it to your other machines.

## Ground rules

The rebuild is clean-room: new code written from a feature spec, never
copied decompiled code or the original's assets, names or trademarks.
That's what makes the result yours and actually debloated. Use it on apps
you own, open-source apps (respecting their license), or as a feature study
of third-party apps. It won't bypass licensing, DRM, paywalls or logins.
See REA's [disclaimer](https://github.com/morluto/rea/blob/main/DISCLAIMER.md).
