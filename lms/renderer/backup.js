(function () {
  const LS_PREFIX = "lms-";
  const PHOTO_DB = "lms-site-photos";
  const PHOTO_STORE = "photos";
  const PDF_DB = "lms-quote-pdfs";
  const PDF_STORE = "pdfs";

  function openDb(name, store, version) {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(name, version);
      req.onerror = () => reject(req.error || new Error("Failed to open " + name));
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
      };
    });
  }

  function idbGetAll(db, store) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const os = tx.objectStore(store);
      const out = {};
      const req = os.openCursor();
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return resolve(out);
        out[String(cursor.key)] = cursor.value;
        cursor.continue();
      };
    });
  }

  function idbClearAndPut(db, store, entries) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      const os = tx.objectStore(store);
      os.clear();
      Object.entries(entries || {}).forEach(([key, value]) => os.put(value, key));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      if (!(blob instanceof Blob)) return resolve(blob);
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  async function serializeStore(entries) {
    const out = {};
    for (const [key, value] of Object.entries(entries || {})) {
      if (value instanceof Blob) {
        out[key] = { __lmsBlob: true, type: value.type || "application/octet-stream", dataUrl: await blobToDataUrl(value) };
      } else if (value && typeof value === "object" && value.data instanceof Blob) {
        out[key] = {
          ...value,
          data: { __lmsBlob: true, type: value.data.type || "application/octet-stream", dataUrl: await blobToDataUrl(value.data) },
        };
      } else {
        out[key] = value;
      }
    }
    return out;
  }

  async function deserializeStore(entries) {
    const out = {};
    for (const [key, value] of Object.entries(entries || {})) {
      if (value && value.__lmsBlob && value.dataUrl) {
        const res = await fetch(value.dataUrl);
        out[key] = await res.blob();
      } else if (value && value.data && value.data.__lmsBlob && value.data.dataUrl) {
        const res = await fetch(value.data.dataUrl);
        out[key] = { ...value, data: await res.blob() };
      } else {
        out[key] = value;
      }
    }
    return out;
  }

  function collectLocalStorage() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(LS_PREFIX)) data[key] = localStorage.getItem(key);
    }
    return data;
  }

  async function buildBackup() {
    let photos = {};
    let pdfs = {};
    try {
      const photoDb = await openDb(PHOTO_DB, PHOTO_STORE, 1);
      photos = await serializeStore(await idbGetAll(photoDb, PHOTO_STORE));
      photoDb.close();
    } catch (_) {}
    try {
      const pdfDb = await openDb(PDF_DB, PDF_STORE, 1);
      pdfs = await serializeStore(await idbGetAll(pdfDb, PDF_STORE));
      pdfDb.close();
    } catch (_) {}

    return {
      app: "lms-scope-of-work",
      version: 1,
      exportedAt: new Date().toISOString(),
      localStorage: collectLocalStorage(),
      indexedDB: {
        [PHOTO_DB]: photos,
        [PDF_DB]: pdfs,
      },
    };
  }

  async function restoreBackup(backup) {
    if (!backup || backup.app !== "lms-scope-of-work") {
      throw new Error("This file is not an LMS Scope of Work backup.");
    }

    Object.keys(localStorage)
      .filter((k) => k.startsWith(LS_PREFIX))
      .forEach((k) => localStorage.removeItem(k));

    Object.entries(backup.localStorage || {}).forEach(([key, value]) => {
      if (key.startsWith(LS_PREFIX) && typeof value === "string") localStorage.setItem(key, value);
    });

    const idb = backup.indexedDB || {};
    try {
      const photoDb = await openDb(PHOTO_DB, PHOTO_STORE, 1);
      await idbClearAndPut(photoDb, PHOTO_STORE, await deserializeStore(idb[PHOTO_DB] || {}));
      photoDb.close();
    } catch (_) {}
    try {
      const pdfDb = await openDb(PDF_DB, PDF_STORE, 1);
      await idbClearAndPut(pdfDb, PDF_STORE, await deserializeStore(idb[PDF_DB] || {}));
      pdfDb.close();
    } catch (_) {}
  }

  function downloadJson(obj, filename) {
    const blob = new Blob([JSON.stringify(obj)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function stamp() {
    const el = document.getElementById("lms-backup-stamp");
    if (!el) return;
    const now = new Date();
    el.textContent = "Auto-saved · " + now.toLocaleString();
  }

  function mountUi() {
    if (document.getElementById("lms-backup-bar")) return;

    const style = document.createElement("style");
    style.textContent = `
      #lms-backup-bar {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 4000;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
        width: max-content;
        max-width: min(420px, calc(100vw - 24px));
        padding: 10px 12px;
        border-radius: 14px;
        background: #1f2933;
        color: #f8fafc;
        box-shadow: 0 12px 30px rgba(15, 23, 42, 0.28);
        font: 600 12px/1.3 "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
        -webkit-app-region: no-drag;
        pointer-events: auto;
      }
      #lms-backup-bar button {
        border: 0;
        border-radius: 999px;
        padding: 8px 12px;
        cursor: pointer;
        font: inherit;
      }
      #lms-backup-download { background: #669900; color: #fff; }
      #lms-backup-restore { background: #e8eef3; color: #1f2933; }
      #lms-backup-stamp { opacity: 0.85; font-weight: 500; margin-right: 4px; }
      #lms-backup-file { display: none; }
      @media (max-width: 720px) {
        #lms-backup-bar { left: 12px; right: 12px; bottom: 12px; }
      }
    `;
    document.head.appendChild(style);

    const bar = document.createElement("div");
    bar.id = "lms-backup-bar";
    bar.innerHTML = `
      <span id="lms-backup-stamp">Auto-saves in this browser</span>
      <button type="button" id="lms-backup-download">Download backup</button>
      <button type="button" id="lms-backup-restore">Restore backup</button>
      <input id="lms-backup-file" type="file" accept=".json,application/json" />
    `;
    document.body.appendChild(bar);

    document.getElementById("lms-backup-download").addEventListener("click", async () => {
      const btn = document.getElementById("lms-backup-download");
      btn.disabled = true;
      btn.textContent = "Preparing…";
      try {
        const backup = await buildBackup();
        const day = new Date().toISOString().slice(0, 10);
        downloadJson(backup, `lms-scope-backup-${day}.json`);
        stamp();
      } catch (err) {
        alert("Could not create backup: " + (err && err.message ? err.message : err));
      } finally {
        btn.disabled = false;
        btn.textContent = "Download backup";
      }
    });

    const fileInput = document.getElementById("lms-backup-file");
    document.getElementById("lms-backup-restore").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files && fileInput.files[0];
      fileInput.value = "";
      if (!file) return;
      if (!confirm("Restore this backup? It will replace the work currently saved in this browser.")) return;
      try {
        const text = await file.text();
        const backup = JSON.parse(text);
        await restoreBackup(backup);
        alert("Backup restored. The page will reload.");
        location.reload();
      } catch (err) {
        alert("Could not restore backup: " + (err && err.message ? err.message : err));
      }
    });

    const originalSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function (key, value) {
      originalSetItem(key, value);
      if (typeof key === "string" && key.startsWith(LS_PREFIX)) stamp();
    };
    stamp();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountUi);
  } else {
    mountUi();
  }
})();
