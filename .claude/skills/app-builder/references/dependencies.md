# Analysis dependencies

REA does not install most analysis engines. Before analyzing a reference
app, check what its target type needs, test what is already present, and
ask the user to install anything missing. Never download or install an
engine yourself without the user's explicit OK, and never point REA at a
JAR or binary the user did not choose.

## What each target needs

| Reference app | Needed for full analysis | Works without it |
|---|---|---|
| Web app, PWA, URL, web bundle | Nothing extra. Live page capture uses an installed Chrome/Chromium. | Everything static |
| Electron / desktop JavaScript | Nothing extra | Everything |
| Android APK / AAB | **JADX MCP JAR 0.7.1** + **full JDK 17+** | Manifest, resources, permissions, SDK inventory |
| Android, on a device | **adb** (Android platform-tools), device with USB debugging | Static analysis |
| iOS IPA, macOS `.app`, DMG | **A Mac** with **Xcode command line tools** | Bundle inventory, plists, Info.plist permissions |
| Native code (Swift/ObjC/C++ binaries, `.so`, `.dll`, `.exe`) | One decompiler: **Ghidra 12.1.x** (free), **Hopper**, or **IDA** | Strings, symbols, layout, imports |
| Flutter / React Native apps | Same as their platform row; their logic is in a Dart/JS bundle REA reads statically | Most of it |

## How to check what is present

```bash
node --version                                  # REA needs 22.19+ or 24.11+
java -version && java --list-modules | grep jdk.compiler   # JDK, not JRE
echo "$REA_JADX_MCP_JAR" "$GHIDRA_INSTALL_DIR"  # engine paths
adb version                                     # Android device work
uname -s                                        # Darwin = Mac
xcode-select -p                                 # Xcode CLT on a Mac
npx -y rea-agents@latest doctor --client claude_code --json   # REA's own readiness report
```

## What to tell the user to install

Give only the rows the current target needs. Phrase it as a short checklist
with the exact commands for their OS, then wait.

**JDK 17+ (needed by JADX; Ghidra needs JDK 21)**
- macOS: `brew install --cask temurin@21`
- Windows: `winget install EclipseAdoptium.Temurin.21.JDK`
- Linux (Debian/Ubuntu): `sudo apt install openjdk-21-jdk`

**JADX MCP JAR 0.7.1 (Android decompiling)**
1. Download `jadx-headless-mcp-0.7.1-all.jar`:
   https://github.com/1013503897/jadx-headless-mcp/releases/download/v0.7.1/jadx-headless-mcp-0.7.1-all.jar
2. Save it somewhere permanent, e.g. `~/re-tools/jadx-headless-mcp-0.7.1-all.jar`.
3. `export REA_JADX_MCP_JAR="$HOME/re-tools/jadx-headless-mcp-0.7.1-all.jar"`
   (add it to `~/.zshrc` or `~/.bashrc`).

**Ghidra 12.1.x (native decompiling, free)**
1. Download the 12.1.x release ZIP from https://github.com/NationalSecurityAgency/ghidra/releases
2. Unzip to e.g. `~/re-tools/ghidra_12.1_PUBLIC`.
3. `export GHIDRA_INSTALL_DIR="$HOME/re-tools/ghidra_12.1_PUBLIC"`

**Hopper (native decompiling, macOS/Linux, paid with a free demo)**
REA can install it: `npx -y rea-agents@latest setup --client claude_code --install-hopper`.
Only offer this if the user prefers Hopper over Ghidra.

**IDA (native decompiling, paid)**
Only if the user already owns it: set `REA_IDA_MCP_CONFIG` to their IDA MCP
registration JSON; see https://github.com/morluto/rea/blob/main/docs/ida-provider.md

**adb (Android devices)**
- macOS: `brew install --cask android-platform-tools`
- Windows: `winget install Google.PlatformTools`
- Linux: `sudo apt install android-tools-adb`

**Mac + Xcode command line tools (iOS/macOS targets)**
`xcode-select --install` on a Mac. On Windows/Linux, say plainly which
parts of the iOS/macOS analysis will be partial, and offer to continue
with the static inventory or to pick it up later on a Mac.

## After the user installs something

Environment variables reach REA only through its MCP registration, which
is written when setup runs. So after they set `REA_JADX_MCP_JAR`,
`GHIDRA_INSTALL_DIR` or `REA_IDA_MCP_CONFIG`:

1. In a terminal where the variable is set:
   `npx -y rea-agents@latest setup --client claude_code --dry-run`
   Show them the plan; on approval run it again with `--yes`.
2. Restart Claude Code.
3. Confirm with `npx -y rea-agents@latest doctor --client claude_code --json`
   that the provider shows `available: true`, then resume the analysis.

If the user would rather skip an engine, continue with what works without
it and record the gaps in `spec/inventory.md`.
