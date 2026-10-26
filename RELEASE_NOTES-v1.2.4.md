# OmniVault v1.2.4

The public collaboration and server-management release. The desktop app is version **1.2.4** and the agent is version **1.4.2**.

## Downloads

- **OmniVault-Setup-1.2.4.exe** — Windows desktop app. Install it, then sign in to the public panel.
- **OmniVaultAgent.exe** — single-file agent for the PC running the Project Reclaimer server. No Node.js install, no ZIP, and no port forwarding for RCON.

The same versions are served by the panel at `/api/desktop/download` and `/api/agent/download`.

Panel: https://omnivaultcontrolpanel.dpdns.org

## Checksums

GitHub release assets, built by the `v1.2.4` workflow:

```text
OmniVault-Setup-1.2.4.exe  d4326fa843bb2d1f68d19a28b5e428519dd6da928f5b3d358329dc03dbaa4229
OmniVaultAgent.exe         48ab3afe395ac6bc961af6ebfd38d23c9903bd6f0a5f75f640e540249b1a69a4
```

## Highlights

- **Server teams with custom roles.** Owners can invite Moderators and Developers, create roles with individual permission checkboxes, change a member's role, and remove access.
- **Owner-controlled deletion.** Deleting files or managed server instances remains owner-only, even if a role requests it.
- **Server files manager.** Read, upload, download, rename, create folders, and organize maps, gametypes, playlists, configs, and other allowed content without exposing the host filesystem.
- **Managed Reclaimer servers.** Create, start, stop, restart, edit, inspect logs, and route RCON for extra Reclaimer instances from the panel. A playlist requires at least three games.
- **Desktop updates.** The desktop app checks the latest GitHub release, verifies the installer size and SHA-256 digest, runs the installer, and reopens the app.
- **Same account isolation.** Other accounts cannot see or control a server unless its owner explicitly invites them.
- **No exposed RCON.** Agent mode connects outward over HTTPS/WSS. Players still connect to the game's normal UDP port; only RCON exposure is removed.

## Agent setup

1. Download `OmniVaultAgent.exe` and put it in a writable folder such as `C:\OmniVaultAgent`.
2. Open PowerShell in that folder.
3. Run the setup command shown in the panel:

   ```powershell
   .\OmniVaultAgent.exe --panel "https://omnivaultcontrolpanel.dpdns.org" --pair "1A2B-3C4D" --rcon-port 49176
   ```

4. To enable **Server files**, add the content folder:

   ```powershell
   .\OmniVaultAgent.exe --panel "https://omnivaultcontrolpanel.dpdns.org" --pair "1A2B-3C4D" --rcon-port 49176 --files-dir "C:\ProjectReclaimer\Content"
   ```

5. To enable **managed Reclaimer instances**, add the folders and executable:

   ```powershell
   .\OmniVaultAgent.exe --panel "https://omnivaultcontrolpanel.dpdns.org" --pair "1A2B-3C4D" --rcon-port 49176 --instances-dir "C:\OmniVault\instances" --reclaimer-exe "C:\Halo Server\project-reclaimer-dedicated.exe" --server-root "C:\Halo Server"
   ```

   The server root must contain Reclaimer's `game\` and `content\` folders.

6. Keep the agent window open. Pairing codes expire after 15 minutes and are single-use.

## Notes

- Windows may show an "Unknown publisher" warning because the executables are not code-signed yet. Choose **More info → Run anyway**.
- The desktop app is a shell for the panel and always loads the current hosted control room. Agent behavior is identical in the desktop app and a browser.
- Direct RCON is restricted to the OmniVault panel administrator, not the administrator of an individual customer's game server. Public accounts must use Agent mode.
- Keep `agent-config.json` private. It contains the agent token and RCON password.
