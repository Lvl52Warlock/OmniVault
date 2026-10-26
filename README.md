# OmniVault

OmniVault is a web control panel and Windows desktop app for **Project Reclaimer** dedicated servers. Server owners can manage status, players, bans, broadcasts, and RCON actions from a browser without exposing their RCON port to the internet.

The recommended connection method is the **OmniVault agent**: a single Windows `.exe` that runs beside the game server and connects outbound to the panel. It needs no Node.js install, no ZIP, no public IP, and no port forwarding.

## Download

| Component | Link |
| --- | --- |
| Web control panel | https://omnivaultcontrolpanel.dpdns.org |
| Windows desktop app | https://omnivaultcontrolpanel.dpdns.org/api/desktop/download |
| Agent for the game-server PC | https://omnivaultcontrolpanel.dpdns.org/api/agent/download |
| GitHub source and releases | https://github.com/Lvl52Warlock/OmniVault |

The same releases are served by the panel at `/api/desktop/download` and `/api/agent/download`.

The desktop app checks the latest GitHub release from its **Check for updates** control in the top bar. It verifies the installer size and SHA-256 digest before running the signed-in-place Windows installer, then reopens the app.

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

- Each account has its own servers. Other accounts cannot list, read, or control them unless the owner invites them to a server team.
- Server owners can invite **Moderators** (kick, end round, end game) and **Developers** (maps, gametypes, playlists, server files, and managed instances).
- Owners can create **custom roles** with checkbox permissions and assign them to team members.
- The agent holds the RCON password locally and connects outward to the panel.
- The panel stores a hash of the agent token, never the RCON password.
- Public accounts use agent mode. Direct RCON is restricted to the panel administrator.
- The files manager is sandboxed to an explicit folder passed to the agent at setup. Only the owner can delete files.
- The agent can create, start, stop, and supervise extra Reclaimer instances. Only the owner can delete an instance, and a playlist needs at least three games.

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

   To enable **Server files**, add the folder that contains maps and playlists:

   ```powershell
   .\OmniVaultAgent.exe --panel "https://omnivaultcontrolpanel.dpdns.org" --pair "1A2B-3C4D" --rcon-port 49176 --files-dir "C:\ProjectReclaimer\Content"
   ```

   The setup wizard also asks for this folder. The agent can only access files below it; executable and script extensions are blocked.

   To enable panel-managed Reclaimer instances, add the instances folder, executable, and server root:

   ```powershell
   .\OmniVaultAgent.exe --panel "https://omnivaultcontrolpanel.dpdns.org" --pair "1A2B-3C4D" --rcon-port 49176 --instances-dir "C:\OmniVault\instances" --reclaimer-exe "C:\Halo Server\project-reclaimer-dedicated.exe" --server-root "C:\Halo Server"
   ```

   The server root must contain Reclaimer's `game\` and `content\` folders. Players still connect to the chosen game port, so forward that UDP port; agent mode only removes the RCON exposure.

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

The NSIS installer is written to `dist\OmniVault-Setup-1.2.4.exe`. It is not code-signed yet, so Windows SmartScreen may show an “Unknown publisher” warning.

## Server teams, files, and instances

Open **Manage access** on a server to create a single-use invitation for a Moderator or Developer. The other person signs in, clicks **Join a server team**, and enters the code. The owner can change roles or remove access at any time.

Moderator actions: kick, end round, end game.

Developer actions: map loading, map browsing, add/overwrite/rename files in the sandboxed server content folder, and create/control managed Reclaimer instances. Developers cannot delete files, delete instances, kick players, ban players, broadcast, or change team access.

Owner actions: everything, including deleting files, deleting instances, custom roles, and managing the team.

Custom roles use checkbox permissions for view, moderation, maps, files, and instance actions. Delete files and delete instances remain owner-only even if a request tries to grant them. A role always keeps **View server** so the member can see the server.

The file manager and managed instances use an Agent. Direct RCON cannot transfer files or manage instances. To enable managed instances on an existing agent, use `--set-instances-dir`, `--set-reclaimer-exe`, and `--set-server-root`, then restart it. The agent writes unique `.omnivault-<id>.toml` files beside the Reclaimer root so multiple instances share the real `game\` and `content\` folders. The panel shows the Reclaimer log when a process fails to start.

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
git tag v1.2.4
git push origin v1.2.4
```

See [DESKTOP-RELEASE.md](DESKTOP-RELEASE.md) for the manual release checklist.

## Security notes

- Passwords are salted and hashed with scrypt.
- Session tokens are stored hashed; sessions last 30 days.
- Login, registration, server changes, and RCON actions are rate-limited.
- The panel serves an explicit allowlist of web assets. Data files and backend source return 404.
- Agent WebSocket connections require a per-server bearer token.
- Server team permissions are checked on the panel for every action; hiding a button is not the security boundary.
- Team invitations are single-use, hashed at rest, expire after 24 hours, and can be revoked by removing the member.
- File operations are restricted to the folder configured with `--files-dir`, reject path traversal and drive-absolute paths, block executable/script extensions, and enforce a 32 MB upload limit.
- Only the server owner can delete files; developers can add, overwrite, and rename allowed content files.
- Agent updates require a valid Ed25519 signature and SHA-256 hash.
- Direct RCON is restricted to the **OmniVault panel administrator** (the operator of this panel), not the administrator of an individual customer's game server. It requires a reachable port and should use a strong, unique password and source-IP restrictions. Public accounts must use Agent mode.
- Ownership checks still apply to panel administrators; being a panel administrator does not expose another account's servers.

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
