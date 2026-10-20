# MouseComb

A kit that turns Claude Code into an app-rebuilding workbench: drop in a
reference app, and Claude uses [REA](https://github.com/morluto/rea) to map
its features, lets you pick what to keep, then builds a new, debloated app
with your branding.

## Install (global, once per machine)

Needs Node.js 22.19+ and Claude Code.

```bash
git clone https://github.com/aydieojewelry/MouseComb.git
cd MouseComb
./install.sh
```

This registers REA's MCP server in your user-level Claude Code config
(`~/.claude.json`, backed up first) and installs two skills into
`~/.claude/skills/`: REA's `reverse-engineer-anything` and this repo's
`rebuild-app`. Restart Claude Code afterwards. Every project on the machine
then has them.

For Claude Code on the web, add this to your cloud environment's setup
script so each new session gets the same tools:

```bash
git clone --depth 1 https://github.com/aydieojewelry/MouseComb.git /tmp/mousecomb && /tmp/mousecomb/install.sh --yes
```

## Use

In any empty project folder:

1. Put the reference app in `reference/` (APK/AAB, IPA, `.app`, `.exe`,
   an Electron app, a web bundle), or have its URL ready.
2. Fill in `brand/brand.json` (Claude creates it from
   [the template](.claude/skills/rebuild-app/brand.example.json)) and drop
   your logo, icon and fonts in `brand/assets/`.
3. Ask Claude Code: *"Rebuild the app in reference/ with my brand."*

Claude will:

1. ask whether you own the app, it's open source, or it's third-party;
2. map its features, SDKs, permissions and bloat with REA into
   `spec/inventory.md`;
3. propose a keep/cut list and target stack in `spec/plan.md` for your OK;
4. write a new app in `app/` from that spec, using your brand;
5. build, test, and report what was kept, cut, and stubbed.

## Ground rules

The rebuild is clean-room: new code written from a feature spec, never
copied decompiled code or the original's assets, names or trademarks.
That's what makes the result yours and actually debloated. Use it on apps
you own, open-source apps (respecting their license), or as a feature study
of third-party apps. It won't bypass licensing, DRM, paywalls or logins.
See REA's [disclaimer](https://github.com/morluto/rea/blob/main/DISCLAIMER.md).
