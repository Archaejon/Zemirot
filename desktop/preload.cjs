/**
 * The renderer stays sandboxed and gets only the update calls it needs.
 * No filesystem or Node APIs are exposed.
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("zemirot", {
  updates: {
    info: () => ipcRenderer.invoke("updates:info"),
    check: () => ipcRenderer.invoke("updates:check"),
    setAutoCheck: (value) => ipcRenderer.invoke("updates:set-auto-check", Boolean(value)),
    onStatus: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("updates:status", listener);
      return () => ipcRenderer.removeListener("updates:status", listener);
    },
  },
  assist: {
    settings: () => ipcRenderer.invoke("assist:settings"),
    saveSettings: (input) => ipcRenderer.invoke("assist:save-settings", input),
    checkOllama: (input) => ipcRenderer.invoke("assist:check-ollama", input ?? {}),
    get: (id) => ipcRenderer.invoke("assist:get", id),
    generate: (song, modes) => ipcRenderer.invoke("assist:generate", { song, modes }),
    generateStream: (song, modes, onProgress) => {
      const requestId = `draft-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 12)}`;
      const listener = (_event, payload) => {
        if (payload?.requestId !== requestId) return;
        onProgress?.({ characters: Number(payload.characters) || 0 });
      };
      ipcRenderer.on("assist:stream", listener);
      const result = ipcRenderer
        .invoke("assist:generate-stream", { requestId, song, modes })
        .finally(() => ipcRenderer.removeListener("assist:stream", listener));
      return {
        requestId,
        result,
        cancel: () => ipcRenderer.send("assist:cancel", requestId),
      };
    },
  },
});
