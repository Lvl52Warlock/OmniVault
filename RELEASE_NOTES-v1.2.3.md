# OmniVault v1.2.3

The first public OmniVault release.

## Downloads

- **OmniVault-Setup-1.2.3.exe** — Windows desktop app. Install it, then sign in to the public panel.
- **OmniVaultAgent.exe** — single-file agent for the PC running the Project Reclaimer server. No Node.js install, no ZIP, and no port forwarding.

The same releases are served by the panel at `/api/desktop/download` and `/api/agent/download`.

## Checksums

GitHub release assets, built by the `v1.2.3` workflow:

```text
OmniVault-Setup-1.2.3.exe  821b4aa2476995b790da83822f0f661f0d7daddee98e22d02389c85f60c16166
OmniVaultAgent.exe         ae4802a00c65b4148e393d25012bdf169fade22a32b4809e106349010dbeba37
```

## Highlights

- Public web control panel with per-account server ownership.
- Windows desktop app for the same panel and account.
- Agent mode connects outbound to the panel over HTTPS/WSS, so home servers, CGNAT, and firewalled servers work without exposing RCON.
- Signed single-file agent updates: SHA-256 and Ed25519 verification, in-place replacement, config preserved.
- Server status, players, bans, broadcasts, and RCON actions.
- Direct RCON remains available to the panel administrator for deliberately exposed servers.

## Agent setup

1. Download `OmniVaultAgent.exe` and put it in a writable folder such as `C:\OmniVaultAgent`.
2. Open PowerShell in that folder.
3. Run the setup command from the panel:

   ```powershell
   .\OmniVaultAgent.exe --panel "https://omnivaultcontrolpanel.dpdns.org" --pair "1A2B-3C4D" --rcon-port 49176
   ```

4. Keep the agent window open.

Pairing codes expire after 15 minutes and are single-use.

## Notes

- Windows may show an “Unknown publisher” warning because the executables are not code-signed yet. Choose **More info → Run anyway**.
- The desktop app is a shell for the panel. It does not start or replace the agent.
- RCON must be enabled on the local server (Project Reclaimer commonly uses port `49176`).
- Keep `agent-config.json` private. It contains the agent token and RCON password.
