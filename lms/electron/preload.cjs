const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronApp', {
  isDesktop: true,
  platform: process.platform,
});
