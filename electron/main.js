/**
 * electron/main.js — Doctor's Copilot desktop shell
 *
 * Responsibilities:
 * 1. Spawn the local Flask backend (python main.py or bundled exe)
 * 2. Cascading handshake: discover active port from stdout, runtime_port.json, or by cascading ping
 * 3. Open BrowserWindow pointing at the discovered local URL
 * 4. Kill Flask backend process tree cleanly when the Electron window closes
 */

const { app, BrowserWindow, ipcMain, Notification, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');

// Generate per-launch cryptographically secure token
const launchAuthToken = process.env.AGENT_D_AUTH_TOKEN || crypto.randomBytes(32).toString('hex');
process.env.AGENT_D_AUTH_TOKEN = launchAuthToken;

const CANDIDATE_PORTS = [5050, 5051, 5052, 5053, 5054, 5055, 5056, 5057, 5058, 5059, 5060];
let activeFlaskPort = process.env.DC_PORT ? parseInt(process.env.DC_PORT, 10) : 5050;
let activeFlaskUrl = `http://127.0.0.1:${activeFlaskPort}`;

let mainWindow = null;
let flaskProcess = null;

// Expose launch auth token to renderer via IPC
ipcMain.handle('get-auth-token', () => launchAuthToken);

// ── Native Desktop Notification handler ──────────────────────────────────────
ipcMain.on('electron-notify', (_event, payload) => {
  try {
    if (Notification && Notification.isSupported()) {
      const title = (payload && payload.title) || 'Agent-D';
      const body = (payload && payload.body) || '';
      const iconPath = path.join(__dirname, 'icon.png');
      const n = new Notification({
        title,
        body,
        icon: iconPath,
        silent: false,
      });
      n.show();
    }
  } catch (err) {
    console.error('Failed to dispatch native notification:', err);
  }
});

ipcMain.handle('app-is-packaged', () => app.isPackaged);

function sendUpdaterStatus(status, data = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater-status', { status, ...data });
  }
}

// ── Auto-updater setup ────────────────────────────────────────────────────────

function setupAutoUpdater() {
  ipcMain.handle('updater-get-info', () => ({
    version: app.getVersion(),
    isPackaged: app.isPackaged,
    isPortable: Boolean(process.env.PORTABLE_EXECUTABLE_DIR),
  }));

  // In development mode, don't run background network updater
  if (!app.isPackaged) {
    ipcMain.on('updater-check', () => {
      sendUpdaterStatus('dev-mode', {
        message: 'Auto-update is disabled in development mode.',
        version: app.getVersion(),
      });
    });
    return;
  }

  const isPortable = Boolean(process.env.PORTABLE_EXECUTABLE_DIR);

  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.autoDownload = !isPortable;

  autoUpdater.on('checking-for-update', () => {
    sendUpdaterStatus('checking');
  });

  autoUpdater.on('update-available', (info) => {
    sendUpdaterStatus('available', {
      version: info.version,
      releaseDate: info.releaseDate,
      isPortable,
      downloadUrl: isPortable ? `https://github.com/Pranshul-Chopra/pm_tool/releases/tag/v${info.version}` : null,
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    sendUpdaterStatus('not-available', {
      version: info ? info.version : app.getVersion(),
      currentVersion: app.getVersion(),
    });
  });

  autoUpdater.on('download-progress', (progressObj) => {
    sendUpdaterStatus('downloading', {
      percent: Math.floor(progressObj.percent || 0),
      bytesPerSecond: progressObj.bytesPerSecond,
      transferred: progressObj.transferred,
      total: progressObj.total,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    sendUpdaterStatus('downloaded', {
      version: info.version,
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('Auto-updater error:', err.message);
    sendUpdaterStatus('error', { message: err.message });
  });

  ipcMain.on('updater-check', () => {
    autoUpdater.checkForUpdates().catch((err) => {
      sendUpdaterStatus('error', { message: err.message });
    });
  });

  ipcMain.on('updater-restart-install', () => {
    // Terminate Flask backend first to release all file locks
    stopFlask();
    setImmediate(() => {
      autoUpdater.quitAndInstall(false, true);
    });
  });

  // Check 3 seconds after launch, then periodically every 60 minutes
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 3000);

  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 60 * 60 * 1000);
}

// ── Port Handshake Utilities ──────────────────────────────────────────────────

function getRuntimePortFilePath() {
  const base = process.env.LOCALAPPDATA || path.join(require('os').homedir(), '.agentd');
  return path.join(base, 'AgentD', 'runtime_port.json');
}

function tryReadRuntimePort() {
  try {
    const file = getRuntimePortFilePath();
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (data && data.port && (Date.now() - (data.timestamp * 1000) < 60000)) {
        return parseInt(data.port, 10);
      }
    }
  } catch (_) {}
  return null;
}

function probePortPing(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/ping`, (res) => {
      if (res.statusCode === 200) {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            if (json && (json.app === 'agent_d' || json.app === 'doctors_copilot' || json.app === 'pm_tool') && json.status === 'ok') {
              return resolve(true);
            }
          } catch (_) {}
          resolve(false);
        });
      } else {
        resolve(false);
      }
    });
    req.on('error', () => resolve(false));
    req.setTimeout(400, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForFlaskCascading(retries = 40, interval = 250) {
  for (let attempt = 0; attempt < retries; attempt++) {
    // 1. Build priority list of candidate ports
    const filePort = tryReadRuntimePort();
    const portsToProbe = [];

    if (filePort && !portsToProbe.includes(filePort)) portsToProbe.push(filePort);
    if (!portsToProbe.includes(activeFlaskPort)) portsToProbe.push(activeFlaskPort);
    for (const p of CANDIDATE_PORTS) {
      if (!portsToProbe.includes(p)) portsToProbe.push(p);
    }

    // 2. Cascade probe across candidate ports
    for (const port of portsToProbe) {
      const ok = await probePortPing(port);
      if (ok) {
        activeFlaskPort = port;
        activeFlaskUrl = `http://127.0.0.1:${port}`;
        console.log(`[handshake] Successfully connected to Agent-D on port ${port}`);
        return activeFlaskUrl;
      }
    }

    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error('Flask backend did not respond on any candidate port within expected time.');
}

// ── Flask Backend Management ──────────────────────────────────────────────────

function stopFlask() {
  if (!flaskProcess) return;
  const proc = flaskProcess;
  flaskProcess = null;

  try {
    if (proc.exitCode !== null || proc.killed) {
      return;
    }

    if (process.platform === 'win32' && proc.pid) {
      const isDev = !app.isPackaged;
      const imagePattern = isDev ? 'python*' : 'flask*';
      spawn('taskkill', ['/pid', proc.pid.toString(), '/fi', `IMAGENAME eq ${imagePattern}`, '/f', '/t'], {
        windowsHide: true,
        stdio: 'ignore',
      });
    } else if (proc.pid) {
      proc.kill('SIGTERM');
    }
  } catch (err) {
    console.error('Error terminating Flask process:', err);
  }
}

function startFlask() {
  const isDev = !app.isPackaged;
  let cmd, args, cwd;

  if (isDev) {
    cmd = process.platform === 'win32' ? 'python' : 'python3';
    args = ['main.py'];
    cwd = path.join(__dirname, '..');
  } else {
    cmd = path.join(process.resourcesPath, 'flask', 'flask.exe');
    args = [];
    cwd = path.join(process.resourcesPath, 'flask');
  }

  flaskProcess = spawn(cmd, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: {
      ...process.env,
      AGENT_D_AUTH_TOKEN: launchAuthToken,
    },
  });

  if (flaskProcess.stdout) {
    flaskProcess.stdout.on('data', (data) => {
      const text = data.toString();
      const match = text.match(/\[(?:DC|PM_TOOL)_HANDSHAKE\] PORT=(\d+)/);
      if (match) {
        activeFlaskPort = parseInt(match[1], 10);
        activeFlaskUrl = `http://127.0.0.1:${activeFlaskPort}`;
        console.log(`[handshake stdout] Discovered port ${activeFlaskPort}`);
      }
    });
  }

  if (flaskProcess.stderr) {
    flaskProcess.stderr.on('data', (data) => {
      console.error(`[flask stderr] ${data.toString().trim()}`);
    });
  }

  flaskProcess.on('error', (err) => {
    console.error('Flask failed to start:', err);
    flaskProcess = null;
  });

  flaskProcess.on('exit', () => {
    flaskProcess = null;
  });
}

// ── Window Lifecycle ──────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#FFFFFF',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      enableRemoteModule: false,
      allowRunningInsecureContent: false,
    },
    autoHideMenuBar: true,
  });

  // Disallow opening new Electron windows; open verified external web links safely in OS default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        shell.openExternal(url);
      }
    } catch (_) {}
    return { action: 'deny' };
  });

  // Guard navigation: restrict in-app top-level navigation to local Flask origin
  mainWindow.webContents.on('will-navigate', (event, navUrl) => {
    try {
      const parsedNav = new URL(navUrl);
      const parsedFlask = new URL(activeFlaskUrl);
      if (parsedNav.origin !== parsedFlask.origin) {
        event.preventDefault();
        if (parsedNav.protocol === 'http:' || parsedNav.protocol === 'https:') {
          shell.openExternal(navUrl);
        }
      }
    } catch (_) {
      event.preventDefault();
    }
  });

  mainWindow.loadURL(`${activeFlaskUrl}/`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    startFlask();
    try {
      await waitForFlaskCascading();
      createWindow();
      setupAutoUpdater();
    } catch (err) {
      console.error(err);
      createWindow();
      setupAutoUpdater();
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  stopFlask();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopFlask();
});
