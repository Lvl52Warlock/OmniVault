OmniVault RCON Agent
====================

This agent runs next to a Project Reclaimer server and connects OUT to the
OmniVault control panel. It needs only outbound TCP 443. It does not require a
public IP, router port forwarding, or an inbound firewall rule.

Requirements
------------
- Windows 10/11 or Windows Server
- The game server's local RCON host, port and password
- No Node.js installation is required; the runtime is inside the executable

Install
-------
1. In the control panel, add a server and choose "Agent".
2. Download OmniVaultAgent.exe and put it in a folder such as C:\OmniVaultAgent.
3. Copy the 8-character pairing code and setup command from the panel.
4. Open PowerShell in the agent folder and run the command. It looks like:

   .\OmniVaultAgent.exe --panel "https://panel.example.com" --pair "1A2B-3C4D" --rcon-port 49176

   The agent prompts for the RCON password so it does not appear in PowerShell
   history. It tests the local RCON connection before pairing, saves
   agent-config.json with restricted permissions, and starts connecting. Add
   --rcon-host 127.0.0.1 if your RCON listens somewhere else on the LAN. Add
   --skip-rcon-test only if the game server is offline during installation.

   To enable the panel's server files manager, add the content folder that
   holds your maps and playlists:

   .\OmniVaultAgent.exe --panel "https://panel.example.com" --pair "1A2B-3C4D" --rcon-port 49176 --files-dir "C:\ProjectReclaimer\Content"

   The setup wizard also asks for this folder. The agent only reads and writes
   files below that folder. Map, gametype, playlist, config, text, and archive
   extensions are allowed by default; executable and script extensions are
   blocked. The server owner can delete files. A Developer team member can add,
   overwrite, and rename files but cannot delete them or use moderation actions.

   Already paired? Enable the file manager without a new pairing code:

   .\OmniVaultAgent.exe --set-files-dir "C:\ProjectReclaimer\Content"

   Stop and restart the agent afterward so the new folder is loaded. The
   existing agent-config.json is updated in place; the token is preserved.

Managed Reclaimer servers from the panel (optional)
----------------------------------------------------
The agent can create, start, stop, and delete extra Project Reclaimer server
instances without opening a second tunnel or pairing again. The panel writes
modal server configs and playlists into these folders, but game traffic still
uses the normal Reclaimer UDP ports, so open/forward those ports for players.

   .\OmniVaultAgent.exe --panel "https://panel.example.com" --pair "1A2B-3C4D" --rcon-port 49176 --instances-dir "C:\OmniVault\instances" --reclaimer-exe "C:\Halo Server\project-reclaimer-dedicated.exe" --server-root "C:\Halo Server"

The server root must be the Reclaimer folder that contains game\ and content\
(usually the folder holding the .exe). The instances folder can be empty and
can live outside the server root. Every playlist needs at least three games,
which is a Project Reclaimer requirement.

Already paired? Add or change the managed-server settings without a new code,
then restart the agent:

   .\OmniVaultAgent.exe --set-instances-dir "C:\OmniVault\instances"
   .\OmniVaultAgent.exe --set-reclaimer-exe "C:\Halo Server\project-reclaimer-dedicated.exe"
   .\OmniVaultAgent.exe --set-server-root "C:\Halo Server"

Only the server owner and team roles with Create server instances can create
instances. Deleting an instance is owner-only. The agent supervises the child
processes and stops them when you ask it to.

Run
---
After setup, keep the window open. To start it again later, double-click
OmniVaultAgent.exe. The agent reconnects automatically after a network
interruption.

The agent only needs outbound HTTPS/WSS to the panel. It never accepts inbound
connections. The RCON password and agent token stay in agent-config.json next
to the executable; the panel stores only a hash of the agent token and never
receives the RCON password.

Check the saved configuration
-----------------------------
   .\OmniVaultAgent.exe --test

Signed automatic updates
------------------------
The agent checks the panel for a newer signed executable when it connects and
every six hours. The panel signs the executable manifest with an Ed25519 key;
the matching public key is embedded in the agent. The agent rejects an update
if the signature, SHA-256 hash, or size is wrong. It replaces its own executable
through a short updater and restarts, preserving agent-config.json.

Keep the executable in a folder the agent account can write to. If the folder
is read-only, the automatic update fails and the old executable keeps running.

Re-pair or revoke
-----------------
Generate a new pairing code in the panel's Agent setup dialog, then run

   .\OmniVaultAgent.exe --setup

Generating a code immediately disconnects the old agent token. If you remove
the server from the panel, its agent token stops working.

Troubleshooting
---------------
- "RCON test failed": make sure the Reclaimer server is running, RCON is
  enabled, and the host/port/password are correct. RCON must listen on
  127.0.0.1 or the LAN address this agent uses.
- "The panel rejected the pairing code": codes expire after 15 minutes and can
  only be used once. Generate a new one in the panel.
- "Disconnected ... 4001": the pairing was revoked or replaced. Run the setup
  command again with a new code.
- Windows SmartScreen: the executable is not code-signed yet. Choose
  "More info" then "Run anyway".
