const { app, BrowserWindow, shell, session } = require('electron');
const path = require('path');

const iconPath = path.join(__dirname, 'icon.png');
const rendererIndex = path.join(__dirname, '../renderer/index.html');

// The web bundle tries to register a service worker. That works on https:// but
// breaks under file:// / app.asar. Disable the feature in Chromium instead of
// deleting navigator.serviceWorker — hiding that native API can stop clicks
// from reaching text fields.
app.commandLine.appendSwitch('disable-features', 'ServiceWorker');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'LMS Scope of Work',
    icon: iconPath,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Load the packaged renderer UI.
  // (Original Vite/React source was not found on this machine — UI lives in /renderer.)
  mainWindow.loadFile(rendererIndex);

  if (!app.isPackaged && process.env.LMS_OPEN_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(async () => {
  try {
    await session.defaultSession.clearStorageData({ storages: ['serviceworkers'] });
  } catch (_) {}

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
