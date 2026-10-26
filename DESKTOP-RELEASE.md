# OmniVault Desktop Releases

The desktop app is built with Electron Builder. The Windows build produces one file:

- `OmniVault-Setup-1.2.4.exe` — installer with Start Menu and desktop shortcuts.

The public panel serves the current installer at `/api/desktop/download` when this file exists:

```text
desktop-dist/OmniVault-Setup.exe
```

There is intentionally no separate portable download. The panel offers one desktop `.exe` and a single-file agent `.exe`; the agent is not installed by the desktop app.

## Build locally

```powershell
npm install
npm run dist:win
```

The artifact is written to `dist/`. Copy it to `desktop-dist/` to make the website download link work:

```powershell
New-Item -ItemType Directory -Force .\desktop-dist | Out-Null
Copy-Item .\dist\OmniVault-Setup-1.2.4.exe .\desktop-dist\OmniVault-Setup.exe -Force
```

`desktop-dist/` is ignored by Git. The installer is not code-signed, so Windows SmartScreen may show an "Unknown publisher" warning until a code-signing certificate is configured.

## Desktop updates

The installed app has a **Check for updates** button in the panel header. It asks GitHub for the latest `OmniVault-Setup-*.exe` asset, compares versions, downloads the installer, verifies its size and SHA-256 digest, then runs the installer silently and reopens the app. The button is only shown inside the desktop shell, never in a browser tab.

The update source is the latest published GitHub release. A build must be published as a release before installed copies can find it.

## Publish on GitHub

The repository is https://github.com/Lvl52Warlock/OmniVault.

The workflow in `.github/workflows/build-desktop.yml` runs on every tag beginning with `v`, builds the Windows installer and the agent executable, and attaches both to a GitHub Release.

```powershell
git tag v1.2.4
git push origin v1.2.4
```

To build manually from GitHub, open **Actions → Build Windows desktop app and agent → Run workflow**. Both executables are available from the workflow run.

## Repository layout

The repository root is this folder. Do not publish the parent game-server folder: it contains `users.json`, `servers.json`, tunnel credentials, the agent update private key, logs, and game files.

## Desktop app and the agent

The desktop app is a desktop shell for the same panel. It does **not** replace the agent and it does **not** start the agent automatically.

- The desktop app opens the public panel URL in `default-panel-url.txt` or `panel-url.txt`.
- The agent runs separately on the game-server PC and connects outbound to the panel.
- If the desktop app is installed on the game-server PC, the agent can run on that same PC. Start it with `OmniVaultAgent.exe`.

## Build the agent executable

The agent is packaged separately from the desktop app:

```powershell
npm install
npm install --prefix agent
npm run build:agent
```

This creates `agent-dist\OmniVaultAgent.exe` (about 56 MB) and `OmniVaultAgent.sha256`. The panel serves the executable at `/api/agent/download`; build it on the panel machine or copy the built file there. The exe contains the Node runtime and its dependency, so game-server owners do not need Node.js or a ZIP.

The exe checks for signed updates and replaces itself in place. Keep it in a folder the agent account can write to. `agent-config.json` sits next to the exe and is preserved across updates.

Agent mode is the same whether the operator uses the browser or the desktop app; the transport and permissions do not change.

## Server teams, files, and managed instances

Agent **1.4.2** adds the server files manager, custom roles, and panel-created Reclaimer instances. Pass the server content folder and managed-instance folders during setup:

```powershell
.\OmniVaultAgent.exe --panel "https://omnivaultcontrolpanel.dpdns.org" --pair "1A2B-3C4D" --rcon-port 49176 --files-dir "C:\ProjectReclaimer\Content" --instances-dir "C:\OmniVault\instances" --reclaimer-exe "C:\Halo Server\project-reclaimer-dedicated.exe" --server-root "C:\Halo Server"
```

The agent only accesses files below the chosen folders. An already-paired agent can enable or change them without a new code with `--set-files-dir`, `--set-instances-dir`, `--set-reclaimer-exe`, and `--set-server-root`, then restart the agent. The server root must contain Reclaimer's `game\` and `content\` folders. A playlist needs at least three games.

Owners can create custom roles with checkbox permissions, invite Moderators/Developers, assign roles, and remove access from **Manage access**. Only the owner can delete files or managed instances. The desktop app does not need to be rebuilt for these panel-side features; it loads the same public panel.
