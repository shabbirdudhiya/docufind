const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  selectFolder: () => ipcRenderer.invoke("select-folder"),
  scanFolder: (folderPath) => ipcRenderer.invoke("scan-folder", folderPath),
  extractContent: (filePath) => ipcRenderer.invoke("extract-content", filePath),
  searchFiles: (query, folderPath) =>
    ipcRenderer.invoke("search-files", query, folderPath),
  startWatching: (folderPath) =>
    ipcRenderer.invoke("start-watching", folderPath),
  stopWatching: () => ipcRenderer.invoke("stop-watching"),
  openFile: (filePath) => ipcRenderer.invoke("open-file", filePath),
  openFileLocation: (filePath) =>
    ipcRenderer.invoke("open-file-location", filePath),

  // File system events
  onFileAdded: (callback) => ipcRenderer.on("file-added", callback),
  onFileUpdated: (callback) => ipcRenderer.on("file-updated", callback),
  onFileRemoved: (callback) => ipcRenderer.on("file-removed", callback),
  onIndexingStatus: (callback) => ipcRenderer.on("indexing-status", callback),

  // Remove listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
});
