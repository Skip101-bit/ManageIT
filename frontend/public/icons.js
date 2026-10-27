/**
 * ManageIT — SVG icon library (stroke icons)
 */
'use strict';

const ICON_PATHS = {
  home: ['M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M9 22V12h6v10'],
  dashboard: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M14 14h7v7h-7z', 'M3 14h7v7H3z'],
  bolt: ['M13 2L3 14h9l-1 8 10-12h-9l1-8z'],
  clipboard: ['M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2', 'M9 2h6v4H9V2z'],
  package: ['M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z', 'M3.27 6.96L12 12.01l8.73-5.05', 'M12 22.08V12'],
  refresh: ['M23 4v6h-6', 'M1 20v-6h6', 'M3.51 9a9 9 0 0 1 14.85-3.36L23 10', 'M1 14l4.64 4.36A9 9 0 0 0 20.49 15'],
  'trend-up': ['M23 6l-9.5 9.5-5-5L1 18', 'M17 6h6v6'],
  'trend-down': ['M23 18l-9.5-9.5-5 5L1 6', 'M17 18h6v-6'],
  settings: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'],
  search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.35-4.35'],
  users: ['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M23 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  user: ['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'],
  download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
  upload: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M17 8l-5-5-5 5', 'M12 3v12'],
  'log-out': ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
  history: ['M3 3v5h5', 'M3.05 13A9 9 0 1 0 6 5.3L3 8'],
  scale: ['M12 3v18', 'M5 7h14', 'M7 7l-2 5h4L7 7z', 'M17 7l-2 5h4l-2-5z'],
  save: ['M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z', 'M17 21v-8H7v8', 'M7 3v5h8'],
  trash: ['M3 6h18', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'],
  warning: ['M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z', 'M12 9v4', 'M12 17h.01'],
  check: ['M20 6L9 17l-5-5'],
  x: ['M18 6L6 18', 'M6 6l12 12'],
  info: ['M12 16v-4', 'M12 8h.01', 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z'],
  plus: ['M12 5v14', 'M5 12h14'],
  edit: ['M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7', 'M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z'],
  pin: ['M12 2l3 7h7l-5.5 4 2 7-6.5-4.5L5.5 20l2-7L2 9h7l3-7z'],
  store: ['M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z'],
  file: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6'],
  chart: ['M18 20V10', 'M12 20V4', 'M6 20v-6'],
  location: ['M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11z', 'M12 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'],
  key: ['M21 2l-2 2', 'M15.5 7.5a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777z', 'M15.5 7.5L19 4', 'M19 4l-3 3'],
  inbox: ['M22 12h-6l-2 3h-4l-2-3H2', 'M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z'],
  layers: ['M12 2L2 7l10 5 10-5-10-5z', 'M2 17l10 5 10-5', 'M2 12l10 5 10-5'],
  'arrow-up': ['M12 19V5', 'M5 12l7-7 7 7'],
  'arrow-down': ['M12 5v14', 'M5 12l7 7 7-7'],
  'chevron-right': ['M9 18l6-6-6-6'],
  droplet: ['M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z'],
};

function icon(name, size = 20, className = 'icon') {
  const paths = ICON_PATHS[name];
  if (!paths) return '';
  const cls = className ? ` class="${className}"` : '';
  const inner = paths.map(d => `<path d="${d}"/>`).join('');
  return `<svg${cls} xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

function iconLabel(name, label, size = 16) {
  return `<span class="icon-inline">${icon(name, size)}<span>${label}</span></span>`;
}

function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(el => {
    const name = el.dataset.icon;
    const size = parseInt(el.dataset.iconSize || '20', 10);
    if (!ICON_PATHS[name]) return;
    el.innerHTML = icon(name, size, '');
  });
}

function auditResultLabel(result) {
  if (result === 'Match') return iconLabel('check', 'Match', 14);
  if (result === 'Surplus') return iconLabel('arrow-up', 'Surplus', 14);
  return iconLabel('arrow-down', 'Shortage', 14);
}

function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(el => {
    const name = el.dataset.icon;
    const size = parseInt(el.dataset.iconSize || '20', 10);
    el.innerHTML = icon(name, size);
  });
}

document.addEventListener('DOMContentLoaded', () => hydrateIcons());

window.icon = icon;
window.iconLabel = iconLabel;
window.hydrateIcons = hydrateIcons;
window.hydrateIcons = hydrateIcons;
window.auditResultLabel = auditResultLabel;

document.addEventListener('DOMContentLoaded', () => hydrateIcons());
