const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronUpdater', {
  /**
   * Listen for updater lifecycle status events.
   * @param {Function} callback - ({ status, info, progress, error }) => void
   */
  onStatus: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const subscription = (_event, data) => callback(data);
    ipcRenderer.on('updater-status', subscription);
    return () => ipcRenderer.removeListener('updater-status', subscription);
  },

  /**
   * Restart the application and install the downloaded update.
   */
  restartAndInstall: () => {
    ipcRenderer.send('updater-restart-install');
  },

  /**
   * Manually check for updates.
   */
  checkForUpdates: () => {
    ipcRenderer.send('updater-check');
  },

  /**
   * Get app environment metadata (packaged state, current version, portable flag).
   */
  getInfo: () => ipcRenderer.invoke('updater-get-info'),
});

contextBridge.exposeInMainWorld('electronNotifier', {
  /**
   * Request native desktop notification display via Electron main process.
   * @param {Object} payload - { title, body }
   */
  sendNotification: (payload) => {
    ipcRenderer.send('electron-notify', payload);
  },
});

contextBridge.exposeInMainWorld('electronEnv', {
  platform: process.platform,
  isPackaged: () => ipcRenderer.invoke('app-is-packaged'),
  getAuthToken: () => ipcRenderer.invoke('get-auth-token'),
});
