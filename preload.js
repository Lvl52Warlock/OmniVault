const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('rcon', {
  status: (s) => ipcRenderer.invoke('rcon:status', s),
  players: (s) => ipcRenderer.invoke('rcon:players', s),
  say: (s, t) => ipcRenderer.invoke('rcon:say', s, t),
  kick: (s, p, r) => ipcRenderer.invoke('rcon:kick', s, p, r),
  ban: (s, p, t, r) => ipcRenderer.invoke('rcon:ban', s, p, t, r),
  unban: (s, t) => ipcRenderer.invoke('rcon:unban', s, t),
  map: (s, m, mode) => ipcRenderer.invoke('rcon:map', s, m, mode),
});