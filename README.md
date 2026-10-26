# OmniVault

OmniVault is a web control panel and Windows desktop app for **Project Reclaimer** dedicated servers. Server owners can manage status, players, bans, broadcasts, and RCON actions from a browser without exposing their RCON port to the internet.

The recommended connection method is the **OmniVault agent**: a single Windows `.exe` that runs beside the game server and connects outbound to the panel. It needs no Node.js install, no ZIP, no public IP, and no port forwarding.

## Download

| Component | Link |
| --- | --- |
| Web control panel | https://omnivaultcontrolpanel.dpdns.org |
| Windows desktop app | https://github.com/Lvl52Warlock/OmniVault/releases/latest |
| Agent for the game-server PC | https://github.com/Lvl52Warlock/OmniVault/releases/latest |

The same releases are served by the panel at `/api/desktop/download` and `/api/agent/download`.

## How it works

```text
Browser / desktop app
        |
        | HTTPS
        v
OmniVault panel  <---- outbound WSS ----  OmniVaultAgent.exe
                                              |
                                              | 127.0.0.1:49176
                                              v
                                       Project Reclaimer
```

- Each account has its own servers. Other accounts cannot list, read, or control them.
- The agent holds the RCON password locally and connects outward to the panel.
- The panel stores a hash of the agent token, never the RCON password.
- Public accounts use agent mode. Direct RCON is restricted to the panel administrator.

## Connect a server

1. Create an account at the panel.
2. Choose **Add server → Agent — no port forwarding**.
3. Enter the local RCON port (Project Reclaimer commonly uses `49176`).
4. Download `OmniVaultAgent.exe` on the game-server PC and put it in a writable folder such as `C:\OmniVaultAgent`.
5. Run the setup command shown in the panel. It looks like this:

   ```powershell
   .\OmniVaultAgent.exe --panel "https://omnivaultcontrolpanel.dpdns.org" --pair "1A2B-3C4D" --rcon-port 49176
   ```

   The agent tests RCON locally, prompts privately for the RCON password, pairs with the panel, saves `agent-config.json` with restricted permissions, and connects.

6. Keep the agent window open. Double-click `OmniVaultAgent.exe` later to reconnect after a reboot.

Pairing codes expire after 15 minutes and are single-use. The agent reconnects automatically after network drops and checks for signed updates every six hours.

## Run locally

Requirements: Node.js 20+ and npm. Public hosting also needs `cloudflared`.

```powershell
npm install
npm run server
```

Open http://127.0.0.1:49222/webpanel/.

To run the desktop shell in development:

```powershell
npm install
npm start
```

Local panel only:

```powershell
npm run start:local
```

## Build the Windows app

```powershell
npm install
npm run dist:win
```

The NSIS installer is written to `dist\OmniVault-Setup-1.2.3.exe`. It is not code-signed yet, so Windows SmartScreen may show an “Unknown publisher” warning.

## Build the agent

The agent is a single-file executable built with `@yao-pkg/pkg`. It embeds Node and the `ws` dependency.

```powershell
npm install
npm install --prefix agent
npm run build:agent
```

Output: `agent-dist\OmniVaultAgent.exe` and `agent-dist\OmniVaultAgent.sha256`.

The agent verifies signed update manifests with `agent/update-public.pem` before replacing its own executable. The matching private key is **not** in this repository.

## Releasing

Pushing a tag that starts with `v` runs [.github/workflows/build-desktop.yml](.github/workflows/build-desktop.yml). The workflow builds the desktop installer and the agent executable, then publishes both to the GitHub release.

```powershell
git tag v1.2.3
git push origin v1.2.3
```

See [DESKTOP-RELEASE.md](DESKTOP-RELEASE.md) for the manual release checklist.

## Security notes

- Passwords are salted and hashed with scrypt.
- Session tokens are stored hashed; sessions last 30 days.
- Login, registration, server changes, and RCON actions are rate-limited.
- The panel serves an explicit allowlist of web assets. Data files and backend source return 404.
- Agent WebSocket connections require a per-server bearer token.
- Agent updates require a valid Ed25519 signature and SHA-256 hash.
- Direct RCON requires a reachable port and should only be used by the administrator with a strong, unique password and source-IP restrictions.

Do not commit `users.json`, `servers.json`, `sessions.json`, `agent-config.json`, tunnel tokens, or the agent update private key. They are excluded by `.gitignore`.

## Repository layout

```text
agent/              Outbound agent and RCON client
agent-dist/         Built agent executable (ignored)
desktop-dist/       Installer served by the panel (ignored)
scripts/            Agent packaging script
webpanel/           Browser control panel
.github/workflows/  Windows build and release workflow
main.js             Panel server and desktop entry point
panel.js/css        Desktop shell assets
```

## License

All rights reserved. The source is published for transparency and release distribution; no license is granted for redistribution or commercial use.
