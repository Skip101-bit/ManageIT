// Dev-only harness: loads renderer/index.html the same way electron/main.cjs does,
// reports console output / load failures / DOM state, then exits.
const { app, BrowserWindow } = require('electron');
const path = require('path');

const messages = [];

function record(kind, text) {
  messages.push(`[${kind}] ${text}`);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'electron', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const wc = win.webContents;

  wc.on('console-message', (...args) => {
    // Electron >= 35 passes (event) with details; older passes (event, level, message, line, sourceId)
    const first = args[0];
    if (first && typeof first === 'object' && 'message' in first) {
      record(`console:${first.level}`, `${first.message} (${first.sourceId || '?'}:${first.lineNumber || 0})`);
    } else {
      record(`console:${args[1]}`, `${args[2]} (${args[4] || '?'}:${args[3] || 0})`);
    }
  });
  wc.on('did-fail-load', (_e, code, desc, url) => record('did-fail-load', `${code} ${desc} ${url}`));
  wc.on('preload-error', (_e, p, err) => record('preload-error', `${p} ${err && err.message}`));
  wc.on('render-process-gone', (_e, details) => record('render-process-gone', JSON.stringify(details)));
  wc.on('unresponsive', () => record('unresponsive', 'renderer unresponsive'));

  try {
    await win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
    record('load', 'did-finish-load OK');
  } catch (err) {
    record('load-error', err && err.message);
  }

  await new Promise((r) => setTimeout(r, 9000));

  let probe;
  try {
    probe = await wc.executeJavaScript(`(function () {
      const root = document.getElementById('root');
      const bar = document.getElementById('lms-backup-bar');
      return {
        title: document.title,
        url: location.href,
        rootChildCount: root ? root.children.length : -1,
        rootTextSample: root ? (root.innerText || '').slice(0, 200) : null,
        backupBarPresent: !!bar,
        backupBarButtons: bar ? Array.from(bar.querySelectorAll('button')).map((b) => b.textContent.trim()) : [],
        electronApp: window.electronApp || null,
        hasServiceWorkerApi: 'serviceWorker' in navigator,
        swController: navigator.serviceWorker && navigator.serviceWorker.controller ? 'present' : 'none',
        localStorageWorks: (function () { try { localStorage.setItem('lms-smoke', '1'); const v = localStorage.getItem('lms-smoke'); localStorage.removeItem('lms-smoke'); return v === '1'; } catch (e) { return 'ERR: ' + e.message; } })(),
        indexedDbWorks: typeof indexedDB !== 'undefined',
      };
    })()`, true);
  } catch (err) {
    probe = { probeError: err && err.message };
  }

  try {
    probe.swRegistrations = await wc.executeJavaScript(
      `navigator.serviceWorker ? navigator.serviceWorker.getRegistrations().then(function (r) { return r.length; }).catch(function (e) { return 'ERR: ' + e.message; }) : 'api hidden'`,
      true
    );
  } catch (err) {
    probe.swRegistrations = 'probe failed: ' + (err && err.message);
  }

  try {
    const image = await wc.capturePage();
    const shot = path.join(__dirname, '..', 'release', 'app-screenshot.png');
    require('fs').writeFileSync(shot, image.toPNG());
    record('screenshot', shot);
  } catch (err) {
    record('screenshot-error', err && err.message);
  }

  console.log('===== SMOKE RESULT =====');
  console.log(JSON.stringify(probe, null, 2));
  console.log('===== MESSAGES (' + messages.length + ') =====');
  messages.forEach((m) => console.log(m));
  console.log('===== END =====');

  app.exit(0);
});
