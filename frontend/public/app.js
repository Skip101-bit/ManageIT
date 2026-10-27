/* =============================================
   ManageIT — app.js
   Storage Management Systems (PTY) Ltd
============================================= */

'use strict';

// ============================================
// CONSTANTS
// ============================================
const JOB_TYPES = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','R','W'];
const INVENTORY_CATEGORIES = ['Production Inventory', 'Service Inventory', 'Legacy Inventory'];
const JOB_CATEGORIES = INVENTORY_CATEGORIES;
const STOCK_CATEGORIES = INVENTORY_CATEGORIES;
const DEFAULT_STORAGE_LOCATIONS = [
  'Production Hanel 1 (105 Workshop)',
  'Production Hanel 2 (105 Workshop)',
  'Production Workshop Shelves (105 Workshop)',
  'Production Stock Pending Valuation',
  'Roboware Hanel 1 (107 Workshop)',
  'Service Stock Storage (107 Storage)',
  'Service Stock Pending Valuation (107 Storage)'
];

function normaliseStockCategory(raw) {
  const r = String(raw || '').trim().toLowerCase();
  if (!r) return '';
  if (r === 'legacy inventory' || r.includes('legacy') || r === 'dismissed' || r.includes('dismiss')) return 'Legacy Inventory';
  if (r === 'service inventory' || r === 'service' || (r.includes('service') && !r.includes('production'))) return 'Service Inventory';
  if (r === 'production inventory' || r === 'production' || r.includes('general') || r.includes('job-specific') || r === 'job' || r === 'general stock') return 'Production Inventory';
  if (INVENTORY_CATEGORIES.includes(String(raw || '').trim())) return String(raw).trim();
  if (/^\d{2}\s/.test(String(raw || '').trim())) return 'Production Inventory';
  return '';
}

const normaliseJobCategory = normaliseStockCategory;

function stockCategoryClass(c) {
  const n = normaliseStockCategory(c) || c;
  return ({ 'Production Inventory': 'stock-production', 'Service Inventory': 'stock-service', 'Legacy Inventory': 'stock-legacy' }[n] || '');
}

function isActiveStockCategory(c) {
  return normaliseStockCategory(c) !== 'Legacy Inventory';
}

// ============================================
// DATABASE (API + localStorage cache)
// ============================================
const DB = {
  users: [],
  jobs: [],
  stock: [],
  activity: [],
  transactions: [],
  storageLocations: [],
  audits: [],
  reconciliations: [],
  pendingApprovals: [],
  auditSessions: [],
  reconHistory: [],
  serialNumbers: [],
  assets: [],
  assetMaintenance: [],
  bomLines: [],
  pastelTimeline: [],
  pastelChecks: [],
  pastelUpdates: [],
  jobCardLines: [],
  stockChecks: [],
  bomHistory: [],
  settings: {},
  useApi: false,
  _syncTimer: null,
  _loading: false,
  _apiReady: false,
  _apiAvailable: false,

  configure() {
    const cfg = window.ManageITConfig || {};
    this.useApi = cfg.useApi !== false;
    ManageITApi.configure(cfg);
  },

  async checkApi() {
    if (!this.useApi) return false;
    const health = await ManageITApi.checkHealth();
    return health.ok && health.databaseConnected;
  },

  applyState(data) {
    if (!data) return;
    ['users','jobs','stock','activity','transactions','storageLocations','audits','reconciliations','pendingApprovals','auditSessions','reconHistory','serialNumbers','assets','assetMaintenance'].forEach(k => {
      if (Array.isArray(data[k])) this[k] = data[k];
    });
    let keepEngineering = false;
    ['bomLines','pastelTimeline','pastelChecks','pastelUpdates','jobCardLines','stockChecks','bomHistory'].forEach(k => {
      if (!Array.isArray(data[k])) return;
      if (!data[k].length && Array.isArray(this[k]) && this[k].length) { keepEngineering = true; return; }
      this[k] = data[k];
    });
    if (keepEngineering) this.scheduleSync();
    this.normalizeCategories();
    this.normalizeUsers();
    if (data.settings && typeof data.settings === 'object') this.settings = data.settings;
  },

  async loadFromApi() {
    const data = await ManageITApi.bootstrap();
    this.applyState(data);
    this.cacheLocal();
    return true;
  },

  cacheLocal() {
    const keys = ['users','jobs','stock','activity','transactions','storageLocations','audits','reconciliations','pendingApprovals','auditSessions','reconHistory','serialNumbers','assets','assetMaintenance','bomLines','pastelTimeline','pastelChecks','pastelUpdates','jobCardLines','stockChecks','bomHistory','settings'];
    keys.forEach(k => {
      try { localStorage.setItem('manageit_' + k, JSON.stringify(this[k])); } catch(e) {}
    });
  },

  load() {
    const keys = ['users','jobs','stock','activity','transactions','storageLocations','audits','reconciliations','pendingApprovals','auditSessions','reconHistory','serialNumbers','assets','assetMaintenance','bomLines','pastelTimeline','pastelChecks','pastelUpdates','jobCardLines','stockChecks','bomHistory','settings'];
    keys.forEach(k => {
      try {
        const raw = localStorage.getItem('manageit_' + k);
        if (raw) this[k] = JSON.parse(raw);
      } catch(e) {}
    });
    this.normalizeCategories();
    this.normalizeUsers();
  },

  normalizeUsers() {
    if (!Array.isArray(this.users)) return;
    this.users = this.users.map(u => {
      let can = u.canAccessLms;
      if (can === true || can === 1 || can === '1' || can === 'true') can = true;
      else if (can === false || can === 0 || can === '0' || can === 'false') can = false;
      else can = u.role === 'admin'; // legacy records: admins keep LMS until an admin sets the flag
      return { ...u, canAccessLms: !!can };
    });
  },

  normalizeCategories() {
    if (Array.isArray(this.jobs)) {
      this.jobs = this.jobs.map(j => ({
        ...j,
        category: normaliseJobCategory(j.category) || j.category || 'Production Inventory'
      }));
    }
    if (Array.isArray(this.stock)) {
      this.stock = this.stock.map(s => ({
        ...s,
        stockCategory: normaliseStockCategory(s.stockCategory) || s.stockCategory || 'Production Inventory',
        jobCategory: s.jobCategory ? (normaliseJobCategory(s.jobCategory) || s.jobCategory) : s.jobCategory
      }));
    }
  },

  save() {
    this.cacheLocal();
    if (this.useApi && this._apiReady) this.scheduleSync();
  },

  scheduleSync() {
    clearTimeout(this._syncTimer);
    this._syncTimer = setTimeout(() => this.syncToApi(), (window.ManageITConfig?.syncDebounceMs) || 800);
  },

  buildSyncPayload() {
    return {
      users: this.users,
      jobs: this.jobs,
      stock: this.stock,
      activity: this.activity,
      transactions: this.transactions,
      storageLocations: this.storageLocations,
      audits: this.audits,
      reconciliations: this.reconciliations,
      pendingApprovals: this.pendingApprovals,
      auditSessions: this.auditSessions,
      reconHistory: this.reconHistory,
      serialNumbers: this.serialNumbers,
      assets: this.assets,
      assetMaintenance: this.assetMaintenance,
      bomLines: this.bomLines,
      pastelTimeline: this.pastelTimeline,
      pastelChecks: this.pastelChecks,
      pastelUpdates: this.pastelUpdates,
      jobCardLines: this.jobCardLines,
      stockChecks: this.stockChecks,
      bomHistory: this.bomHistory,
      settings: this.settings
    };
  },

  async syncToApi() {
    if (!this.useApi || !this._apiReady || !ManageITApi.getToken()) return;
    try {
      await ManageITApi.sync(this.buildSyncPayload());
      showConnectionStatus('connected');
    } catch (e) {
      if (ManageITApi.getToken() && this._apiAvailable) {
        showConnectionStatus('connected');
        UI.toastWithAction('Could not sync to SQL Server. Changes saved locally.', 'error', 'Retry', () => this.syncToApi());
      } else {
        showConnectionStatus('offline');
      }
    }
  },

  async initData() {
    this.configure();
    this.load();
    if (this.useApi) {
      this._apiAvailable = await this.checkApi();
      if (this._apiAvailable && ManageITApi.getToken()) {
        try {
          await this.loadFromApi();
          this._apiReady = true;
          showConnectionStatus('connected');
          if (!this.users.length) this.seed();
          return;
        } catch (e) {
          ManageITApi.clearToken();
          this._apiReady = false;
          showConnectionStatus('available');
        }
      } else if (this._apiAvailable) {
        showConnectionStatus('available');
      } else {
        showConnectionStatus('offline');
      }
    }
    this._apiReady = false;
    this.seed();
  },

  seed() {
    // Seed admin user
    if (!this.users.length) {
      this.users = [
        { id: uid(), salNumber: '10001', firstName: 'Admin', lastName: 'User', password: 'admin123', role: 'admin', status: 'Active', canAccessLms: true, createdAt: new Date().toISOString() },
        { id: uid(), salNumber: '10002', firstName: 'John', lastName: 'Smith', password: 'pass123', role: 'stockCapturer', status: 'Active', canAccessLms: false, createdAt: new Date().toISOString() },
        { id: uid(), salNumber: '10003', firstName: 'Sarah', lastName: 'Johnson', password: 'pass123', role: 'approver', status: 'Active', canAccessLms: false, createdAt: new Date().toISOString() },
        { id: uid(), salNumber: '10004', firstName: 'Mike', lastName: 'Williams', password: 'pass123', role: 'storeManager', status: 'Active', canAccessLms: false, createdAt: new Date().toISOString() },
        { id: uid(), salNumber: '10005', firstName: 'Lisa', lastName: 'Brown', password: 'pass123', role: 'auditor', status: 'Active', canAccessLms: false, createdAt: new Date().toISOString() },
        { id: uid(), salNumber: '10006', firstName: 'Tom', lastName: 'Davis', password: 'pass123', role: 'viewer', status: 'Active', canAccessLms: false, createdAt: new Date().toISOString() },
      ];
    }
    if (!this.storageLocations.length) {
      this.storageLocations = DEFAULT_STORAGE_LOCATIONS.map(name => ({
        id: uid(), name, description: '', building: name.match(/\(([^)]+)\)/)?.[1] || '', type: name.includes('Hanel') ? 'Hanel' : name.includes('Shelf') || name.includes('Shelves') ? 'Shelf' : 'Other'
      }));
    }
    if (!this.jobs.length) {
      this.jobs = [
        { id: uid(), jobNumber: 'JOB-001', jobDescription: 'Racking Installation - Site A', jobType: 'A', orderConfirmation: 'OC-2024-001', category: 'Production Inventory', status: 'Active', createdAt: new Date().toISOString() },
        { id: uid(), jobNumber: 'JOB-002', jobDescription: 'Service & Maintenance - Warehouse B', jobType: 'B', orderConfirmation: 'OC-2024-002', category: 'Service Inventory', status: 'Active', createdAt: new Date().toISOString() },
        { id: uid(), jobNumber: 'JOB-003', jobDescription: 'Vertical Storage Project', jobType: 'C', orderConfirmation: 'OC-2024-003', category: 'Production Inventory', status: 'On Hold', createdAt: new Date().toISOString() },
      ];
    }
    if (!this.stock.length) {
      this.stock = [
        { id: uid(), stockNumber: 'STK-001', partNumber: 'PN-4512', partDescription: 'Steel Bracket 200mm', serialNumber: '', quantity: 45, stockCategory: 'Production Inventory', storageLocation: 'Production Hanel 1 (105 Workshop)', trayBin: 'A1', poNumber: 'PO-2024-001', jobNumber: '', jobCategory: '', createdAt: new Date().toISOString() },
        { id: uid(), stockNumber: 'STK-002', partNumber: 'PN-7834', partDescription: 'Drive Belt Assembly', serialNumber: 'SN-001234', quantity: 3, stockCategory: 'Service Inventory', storageLocation: 'Service Stock Storage (107 Storage)', trayBin: 'B2', poNumber: 'PO-2024-002', jobNumber: '', jobCategory: '', createdAt: new Date().toISOString() },
        { id: uid(), stockNumber: 'STK-003', partNumber: 'PN-1122', partDescription: 'Control Panel Unit', serialNumber: 'SN-CP-001', quantity: 2, stockCategory: 'Production Inventory', storageLocation: 'Roboware Hanel 1 (107 Workshop)', trayBin: 'C1', poNumber: 'PO-2024-003', jobNumber: 'JOB-001', jobCategory: 'Production Inventory', createdAt: new Date().toISOString() },
        { id: uid(), stockNumber: 'STK-004', partNumber: 'PN-9900', partDescription: 'Hydraulic Seal Kit', serialNumber: '', quantity: 12, stockCategory: 'Service Inventory', storageLocation: 'Service Stock Storage (107 Storage)', trayBin: 'B4', poNumber: 'PO-2024-004', jobNumber: '', jobCategory: '', createdAt: new Date().toISOString() },
        { id: uid(), stockNumber: 'STK-005', partNumber: 'PN-3300', partDescription: 'Motor 1.5kW', serialNumber: 'SN-MTR-007', quantity: 1, stockCategory: 'Production Inventory', storageLocation: 'Production Workshop Shelves (105 Workshop)', trayBin: 'D3', poNumber: 'PO-2024-005', jobNumber: '', jobCategory: '', createdAt: new Date().toISOString() },
      ];
    }
    if (!this.activity.length) {
      this.logActivity('System', 'Initialized', 'App', 'ManageIT initialized with demo data');
    }
    if (!this.settings.company) {
      this.settings = { company: 'Storage Management Systems (PTY) Ltd', lowStockThreshold: 5, lowStockAlert: true, activityLog: true };
    }
    if (!this.assets.length) {
      this.assets = [
        { id: uid(), assetNumber: 'AST-001', assetName: 'Toyota Forklift 2.5T', description: 'Warehouse forklift — production area', category: 'Vehicle', subCategory: 'Forklift', manufacturer: 'Toyota', model: '8FG25', serialNumber: 'FL-88291', assetTag: 'TAG-001', status: 'In Use', condition: 'Good', storageLocation: 'Production Workshop Shelves (105 Workshop)', jobNumber: 'JOB-001', assignedTo: 'Mike Williams', department: 'Warehouse', purchaseDate: '2022-03-15', purchaseCost: 285000, currentValue: 210000, warrantyExpiry: '2025-03-15', nextInspectionDue: '2026-08-01', maintenanceIntervalDays: 90, depreciationYears: 7, notes: '', createdAt: new Date().toISOString() },
        { id: uid(), assetNumber: 'AST-002', assetName: 'Hanel Storage Unit Controller', description: 'Vertical lift module controller — Hanel 1', category: 'Warehouse Equipment', subCategory: '', manufacturer: 'Hanel', model: 'Rotomat', serialNumber: 'HN-4402', assetTag: 'TAG-002', status: 'Active', condition: 'Excellent', storageLocation: 'Production Hanel 1 (105 Workshop)', jobNumber: '', assignedTo: '', department: 'Production', purchaseDate: '2020-06-01', purchaseCost: 450000, currentValue: 320000, warrantyExpiry: '2023-06-01', lastInspectionDate: '2025-07-01', nextInspectionDue: '2026-07-15', maintenanceIntervalDays: 180, depreciationYears: 10, notes: 'Annual service contract with OEM', createdAt: new Date().toISOString() },
        { id: uid(), assetNumber: 'AST-003', assetName: 'DeWalt Impact Driver Set', description: 'Portable power tools — service team', category: 'Tool', manufacturer: 'DeWalt', model: 'DCK266D2', serialNumber: 'DW-99102', assetTag: 'TAG-003', status: 'Active', condition: 'Fair', storageLocation: 'Service Stock Storage (107 Storage)', jobNumber: '', assignedTo: 'John Smith', department: 'Service', purchaseDate: '2024-01-10', purchaseCost: 4500, currentValue: 3200, nextInspectionDue: '2026-09-01', maintenanceIntervalDays: 365, notes: '', createdAt: new Date().toISOString() }
      ];
    }
    if (!this.assetMaintenance.length && this.assets.length) {
      this.assetMaintenance = [
        { id: uid(), assetId: this.assets[0].id, assetNumber: this.assets[0].assetNumber, assetName: this.assets[0].assetName, maintenanceType: 'Preventive', status: 'Scheduled', scheduledDate: '2026-08-15', vendor: 'Toyota Service', description: 'Quarterly forklift service', nextDueDate: '2026-11-15', notes: '', createdAt: new Date().toISOString() },
        { id: uid(), assetId: this.assets[1].id, assetNumber: this.assets[1].assetNumber, assetName: this.assets[1].assetName, maintenanceType: 'Inspection', status: 'Completed', scheduledDate: '2025-07-01', completedDate: '2025-07-01', performedBy: 'OEM Technician', vendor: 'Hanel SA', cost: 8500, description: 'Annual inspection and calibration', partsUsed: 'Filters, lubricants', nextDueDate: '2026-07-01', notes: 'Passed — no issues', createdAt: new Date().toISOString() }
      ];
    }
    this.save();
  }
};

// ============================================
// APP STATE
// ============================================
let currentUser = null;
let selectedJobId = null;
let selectedStockId = null;
let selectedUserId = null;
let selectedStorageId = null;
let bookInMode = 'general';
let bookOutMode = 'general';
let transferMode = 'general';
let reconcileData = [];
let confirmCallback = null;

// ============================================
// UTILITIES
// ============================================
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' +
    d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
}

function initials(first, last) {
  return ((first?.[0] || '') + (last?.[0] || '')).toUpperCase() || '?';
}

function qs(selector, ctx = document) { return ctx.querySelector(selector); }
function qsa(selector, ctx = document) { return [...ctx.querySelectorAll(selector)]; }
function show(el) { if (el) el.classList.remove('hidden'); }
function hide(el) { if (el) el.classList.add('hidden'); }
function val(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }
function setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v ?? ''; }
function getText(id) { return val(id); }

/** Normalize SAL for lookup (trim, remove whitespace). Matches dbo.Users.SALNumber VARCHAR(20). */
function normalizeSalNumber(sal) {
  return (sal || '').trim().replace(/\s+/g, '');
}

/** Allow alphanumeric SAL codes with common separators (real ERP users are not always numeric-only). */
function isValidSalNumber(sal) {
  const normalized = normalizeSalNumber(sal);
  return normalized.length >= 1 && normalized.length <= 20 && /^[A-Za-z0-9._-]+$/.test(normalized);
}

// ============================================
// TOAST
// ============================================
function emptyState(iconName, message) {
  return `<div class="list-empty"><div class="list-empty-icon">${icon(iconName, 40, '')}</div>${message}</div>`;
}

function statusBadge(kind, label) {
  const iconName = kind === 'match' ? 'check' : kind === 'surplus' ? 'arrow-up' : 'arrow-down';
  return `<span class="status-badge status-${kind}">${iconLabel(iconName, label, 14)}</span>`;
}

function toast(msg, type = 'info', duration = 3500) {
  const iconNames = { success: 'check', error: 'x', warning: 'warning', info: 'info' };
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span class="toast-icon" aria-hidden="true">${icon(iconNames[type] || 'info', 18, '')}</span><span class="toast-msg">${UI.esc(msg)}</span>`;
  c.appendChild(t);
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 300);
  }, duration);
}

// ============================================
// CONFIRM MODAL
// ============================================
function confirm(title, msg, okLabel, okClass, cb) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = msg;
  const btn = document.getElementById('confirmOkBtn');
  btn.textContent = okLabel || 'Delete';
  btn.className = `btn ${okClass || 'btn-danger'}`;
  confirmCallback = cb;
  UI._confirmReturnFocus = document.activeElement;
  document.getElementById('confirmModal').classList.add('open');
  UI.trapFocusInModal();
}
function closeConfirm() {
  document.getElementById('confirmModal').classList.remove('open');
  confirmCallback = null;
  if (UI._confirmReturnFocus?.focus) UI._confirmReturnFocus.focus();
}
document.getElementById('confirmOkBtn').addEventListener('click', () => {
  if (confirmCallback) confirmCallback();
  closeConfirm();
});

// ============================================
// ACTIVITY LOGGING
// ============================================
function isApiMode() {
  return DB.useApi && DB._apiReady && ManageITApi.getToken();
}

function stockPayloadFromItem(s) {
  return {
    stockNumber: s.stockNumber,
    stockCategory: s.stockCategory,
    partNumber: s.partNumber,
    serialNumber: s.serialNumber,
    partDescription: s.partDescription,
    quantity: s.quantity,
    poNumber: s.poNumber,
    storageLocation: s.storageLocation,
    trayBin: s.trayBin,
    jobNumber: s.jobNumber,
    jobCategory: s.jobCategory
  };
}

function isServerId(id) {
  return id && /^\d+$/.test(String(id));
}

async function persistStockItem(item, isNew) {
  if (!isApiMode()) return item;
  const payload = stockPayloadFromItem(item);
  if (isNew || !isServerId(item.id)) {
    const created = await ManageITApi.createStock(payload);
    Object.assign(item, created);
    const idx = DB.stock.findIndex(s => s.stockNumber === item.stockNumber && !isServerId(s.id));
    if (idx >= 0) DB.stock[idx] = created;
  } else {
    const updated = await ManageITApi.updateStock(item.id, payload);
    Object.assign(item, updated);
  }
  return item;
}

async function persistTransaction(tx) {
  if (!isApiMode()) return tx;
  const payload = {
    stockItemId: tx.stockItemId,
    stockNumber: tx.stockNumber,
    partDescription: tx.partDescription,
    type: tx.type,
    quantity: tx.quantity,
    qtyBefore: tx.qtyBefore,
    qtyAfter: tx.qtyAfter,
    storageLocation: tx.storageLocation,
    jobNumber: tx.jobNumber,
    transferTo: tx.transferTo,
    transferFrom: tx.transferFrom,
    poNumber: tx.poNumber,
    comment: tx.comment || '',
    userName: tx.userName,
    timestamp: tx.timestamp
  };
  const saved = await ManageITApi.createTransaction(payload);
  Object.assign(tx, saved);
  return tx;
}

DB.logActivity = function(userName, action, screen, description, stockNum = '', qty = '') {
  if (!this.settings.activityLog && this.settings.activityLog !== undefined) return;
  const entry = {
    id: uid(),
    userName,
    actionPerformed: action,
    screenVisited: screen,
    activityDescription: description,
    stockNumber: stockNum,
    quantity: String(qty),
    timestamp: new Date().toISOString()
  };
  this.activity.unshift(entry);
  if (isApiMode()) {
    ManageITApi.createActivity(entry).then(saved => {
      if (saved?.id) entry.id = saved.id;
      this.cacheLocal();
    }).catch(() => this.scheduleSync());
  } else {
    this.save();
  }
};

// ============================================
// AUTH
// ============================================
ManageITApi.setUnauthorizedHandler((message) => {
  handleSessionExpired(message);
});

function showConnectionStatus(mode) {
  let el = document.getElementById('apiStatusBadge');
  if (!el) {
    const header = document.querySelector('.app-header-user');
    if (header) {
      el = document.createElement('span');
      el.id = 'apiStatusBadge';
      el.className = 'api-status-badge';
      header.insertBefore(el, header.firstChild);
    }
  }
  UI.updateConnectionIndicators(mode);
}

function handleSessionExpired(message) {
  ManageITApi.clearToken();
  sessionStorage.removeItem('manageit_session');
  DB._apiReady = false;
  currentUser = null;
  document.getElementById('screen-app')?.classList.remove('active');
  document.getElementById('screen-login')?.classList.add('active');
  showConnectionStatus(DB._apiAvailable ? 'available' : 'offline');
  if (message) toast(message, 'error');
}

function roleLabel(code) {
  return ManageITPerms.ROLE_LABELS[ManageITPerms.normalizeRole(code)] || code;
}

function applyLoggedInUI(user, permissions, roleDisplayName) {
  currentUser = user;
  ManageITPerms.load(user, permissions);
  sessionStorage.setItem('manageit_session', JSON.stringify({ id: user.id, role: user.role }));
  document.getElementById('headerUserName').textContent = user.firstName + ' ' + user.lastName;
  document.getElementById('headerUserSal').textContent = 'SAL ' + user.salNumber;
  document.getElementById('headerAvatar').textContent = initials(user.firstName, user.lastName);
  const badge = document.getElementById('headerRoleBadge');
  badge.textContent = roleDisplayName || ManageITPerms.getRoleLabel();
  badge.className = 'app-header-badge ' + ManageITPerms.roleBadgeClass();
  document.getElementById('homeUserName').textContent = user.firstName;
  ManageITPerms.applyNav();
  refreshLmsPortalCard();
  document.getElementById('screen-login').classList.remove('active');
  document.getElementById('screen-app').classList.add('active');
}

const BRANDS = {
  sms: { mark: 'Manage', accent: 'IT', company: 'Storage Management Systems (PTY) Ltd', title: 'ManageIT — Storage Management Systems' },
  lms: { mark: 'L', accent: 'MS', company: 'Liquid Management Systems', title: 'LMS — Liquid Management Systems' }
};

function setBrand(id) {
  const brand = BRANDS[id] ? id : 'sms';
  if (brand === 'lms' && !loginLmsAllowed) return;
  const info = BRANDS[brand];
  document.documentElement.dataset.brand = brand;
  sessionStorage.setItem('manageit_brand', brand);
  document.title = info.title;
  document.querySelectorAll('[data-brand-mark]').forEach(el => { el.textContent = info.mark; });
  document.querySelectorAll('[data-brand-accent]').forEach(el => { el.textContent = info.accent; });
  document.querySelectorAll('[data-brand-company]').forEach(el => { el.textContent = info.company; });
  document.querySelectorAll('.login-brand').forEach(btn => {
    const on = btn.dataset.brand === brand;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });
}

let loginLmsAllowed = false;
let loginLmsCheckTimer = null;

function setLoginLmsVisible(allowed) {
  loginLmsAllowed = !!allowed;
  const lmsBtn = document.getElementById('brandLms');
  const brands = document.getElementById('loginBrands');
  if (lmsBtn) {
    lmsBtn.classList.toggle('hidden', !loginLmsAllowed);
    lmsBtn.setAttribute('aria-hidden', loginLmsAllowed ? 'false' : 'true');
  }
  if (brands) brands.classList.toggle('sms-only', !loginLmsAllowed);
  if (!loginLmsAllowed && document.documentElement.dataset.brand === 'lms') setBrand('sms');
}

async function refreshLoginLmsVisibility() {
  const sal = normalizeSalNumber(val('loginSal') || '');
  if (!sal || !isValidSalNumber(sal)) {
    setLoginLmsVisible(false);
    return;
  }
  const localUser = DB.users.find(u => u.salNumber === sal && u.status === 'Active');
  const localAllowed = !!(localUser && localUser.canAccessLms);
  if (DB.useApi && DB._apiAvailable) {
    const apiAllowed = await ManageITApi.checkLmsAccess(sal);
    if (apiAllowed !== null) {
      setLoginLmsVisible(apiAllowed);
      return;
    }
  }
  setLoginLmsVisible(localAllowed);
}

function scheduleLoginLmsVisibility() {
  clearTimeout(loginLmsCheckTimer);
  loginLmsCheckTimer = setTimeout(() => { refreshLoginLmsVisibility(); }, 250);
}

setLoginLmsVisible(false);
setBrand('sms');

function finishLogin(user, permissions, roleDisplayName) {
  if (user.status === 'Inactive') return toast('This account is inactive. Contact your administrator.', 'error');
  const brand = document.documentElement.dataset.brand || 'sms';
  if (brand === 'lms' && !user.canAccessLms) {
    setBrand('sms');
    setLoginLmsVisible(false);
    return toast('You do not have access to LMS. Contact your administrator.', 'error');
  }
  applyLoggedInUI(user, permissions, roleDisplayName);
  applyPortalUI();
  DB.logActivity(user.firstName + ' ' + user.lastName, 'Login', 'Login', 'User logged in successfully');
  if (brand === 'lms') {
    sessionStorage.setItem('manageit_can_access_lms', '1');
    location.href = '/lms/';
    return;
  }
  sessionStorage.removeItem('manageit_can_access_lms');
  navTo('home');
}

async function login() {
  const sal = val('loginSal');
  const pwd = val('loginPassword');
  UI.clearFormErrors(['loginSal', 'loginPassword']);
  if (!sal) { UI.setFieldError('loginSal', 'Enter your SAL number'); return toast('Please enter your SAL number.', 'error'); }
  if (!pwd) { UI.setFieldError('loginPassword', 'Enter your password'); return toast('Please enter your password.', 'error'); }
  const salNormalized = normalizeSalNumber(sal);
  if (!isValidSalNumber(salNormalized)) {
    UI.setFieldError('loginSal', 'Enter a valid SAL number');
    return toast('Enter a valid SAL number (letters, numbers, . _ - allowed, max 20 characters).', 'error');
  }
  const brand = document.documentElement.dataset.brand || 'sms';

  if (DB.useApi && DB._apiAvailable) {
    const btn = document.getElementById('loginBtn');
    await UI.withButtonLoading(btn, 'Signing in…', async () => {
      const data = await ManageITApi.login(salNormalized, pwd, brand);
      if (!data.success) throw new Error(data.message || 'Login failed');
      ManageITApi.setToken(data.token);
      DB._apiReady = true;
      try {
        await DB.loadFromApi();
        showConnectionStatus('connected');
      } catch (e) {
        ManageITApi.clearToken();
        DB._apiReady = false;
        throw new Error('Login succeeded but could not load data. Please try again.');
      }
      finishLogin(data.user, data.permissions, data.roleDisplayName);
    }).catch(err => toast(err.message || 'Login failed', 'error'));
    return;
  }

  const user = DB.users.find(u => u.salNumber === salNormalized);
  if (!user) return toast('SAL number not found. Please try again.', 'error');
  if (user.password !== pwd) return toast('Incorrect password. Please try again.', 'error');
  finishLogin(user, null, null);
}

function logout() {
  confirm('Logout', 'Are you sure you want to logout?', 'Logout', 'btn-danger', () => {
    if (currentUser) DB.logActivity(currentUser.firstName + ' ' + currentUser.lastName, 'Logout', 'App', 'User logged out');
    sessionStorage.removeItem('manageit_session');
    sessionStorage.removeItem('manageit_can_access_lms');
    ManageITApi.clearToken();
    DB._apiReady = false;
    currentUser = null;
    document.getElementById('screen-app').classList.remove('active');
    document.getElementById('screen-login').classList.add('active');
    setVal('loginSal', '');
    setVal('loginPassword', '');
    setLoginLmsVisible(false);
    setBrand('sms');
    showConnectionStatus(DB._apiAvailable ? 'available' : 'offline');
  });
}

// Login on Enter key
document.getElementById('loginPassword').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
document.getElementById('loginSal').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('loginPassword').focus(); });
document.getElementById('loginSal').addEventListener('input', scheduleLoginLmsVisibility);
document.getElementById('loginSal').addEventListener('blur', () => { refreshLoginLmsVisibility(); });
document.getElementById('loginBtn').addEventListener('click', login);

// ============================================
// PORTALS
// ============================================
let activePortal = null;

const PORTAL_PAGES = {
  stockit: ['stockithome', 'inventorylist', 'jobstock', 'transactions', 'audit', 'reconciliation', 'bom', 'pastel', 'approvals'],
  admin: ['adminhome', 'adminusers', 'settings', 'rolematrix', 'jobmanagement', 'generalstock', 'addstorage', 'assetmanagement', 'usermanagement', 'adduser'],
  reports: ['dashboard', 'quickactions', 'kpi', 'exports', 'useractivity', 'workactivity']
};

const PORTAL_LANDING = { stockit: 'stockithome', admin: 'adminhome', reports: 'dashboard' };

function invLabel(text) {
  if (!text) return text;
  return String(text).replace(/\bStock\b/g, 'Inventory');
}

function portalForPage(pageId) {
  for (const [portal, pages] of Object.entries(PORTAL_PAGES)) {
    if (pages.includes(pageId)) return portal;
  }
  return null;
}

function triggerSidebarNavEnter(sidebar) {
  if (!sidebar) return;
  sidebar.classList.remove('sidebar-nav-enter', 'sidebar-nav-done');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      sidebar.classList.add('sidebar-nav-enter');
      window.clearTimeout(sidebar._navEnterTimer);
      sidebar._navEnterTimer = window.setTimeout(() => {
        sidebar.classList.add('sidebar-nav-done');
      }, 900);
    });
  });
}

function applyPortalUI() {
  const sidebar = document.getElementById('sidebar');
  const header = document.getElementById('sidebarPortalHeader');
  const isHub = !activePortal;
  document.body.classList.toggle('portal-hub', isHub);
  document.body.classList.toggle('portal-active', !isHub);
  if (sidebar) sidebar.classList.toggle('portal-visible', !isHub);
  if (sidebar && !isHub) {
    triggerSidebarNavEnter(sidebar);
  } else if (sidebar) {
    sidebar.classList.remove('sidebar-nav-enter', 'sidebar-nav-done');
    window.clearTimeout(sidebar._navEnterTimer);
  }
  if (header) header.classList.toggle('hidden', isHub);
  qsa('.portal-nav').forEach(el => el.classList.add('hidden'));
  if (activePortal) {
    const nav = document.getElementById('nav-portal-' + activePortal);
    if (nav) {
      nav.classList.remove('hidden');
      nav.classList.remove('portal-nav-animate');
      requestAnimationFrame(() => {
        nav.classList.add('portal-nav-animate');
      });
    }
    const titles = { stockit: 'Stock-IT', admin: 'Admin', reports: 'Reports' };
    const titleEl = document.getElementById('sidebarPortalTitle');
    if (titleEl) titleEl.textContent = titles[activePortal] || activePortal;
  }
}

function enterPortal(portalId, landingPage) {
  activePortal = portalId;
  applyPortalUI();
  navTo(landingPage || PORTAL_LANDING[portalId] || 'home', null, true);
}

function exitPortal() {
  activePortal = null;
  applyPortalUI();
  navTo('home', null, true);
}

function userCanAccessLms(user = currentUser) {
  if (!user) return false;
  if (user.canAccessLms === true || user.canAccessLms === 1 || user.canAccessLms === '1') return true;
  if (user.canAccessLms === false || user.canAccessLms === 0 || user.canAccessLms === '0') return false;
  return user.role === 'admin';
}

function refreshLmsPortalCard() {
  const card = document.getElementById('portalCardLms');
  if (!card) return;
  card.classList.toggle('hidden', !userCanAccessLms());
}

function openLmsPortal() {
  if (!userCanAccessLms()) {
    return toast('You do not have access to LMS. Contact your administrator.', 'error');
  }
  sessionStorage.setItem('manageit_can_access_lms', '1');
  sessionStorage.setItem('manageit_brand', 'lms');
  if (currentUser) {
    DB.logActivity(
      currentUser.firstName + ' ' + currentUser.lastName,
      'Open LMS',
      'Portals',
      'Opened LMS Scope of Work from ManageIT portals'
    );
  }
  location.href = '/lms/';
}

// ============================================
// NAVIGATION
// ============================================
function navTo(pageId, navEl, skipPortalInfer) {
  if (pageId === 'jobcard') pageId = 'bom';
  UI.toggleMobileSidebar(false);

  const pagePerms = {
    usermanagement: 'UserManagement', adduser: 'UserManagement', adminusers: 'UserManagement',
    settings: 'SystemSettings', adminhome: 'UserManagement',
    kpi: 'ViewReports', exports: 'ExportReports', useractivity: 'ViewReports', workactivity: 'ViewReports',
    transactions: 'TransactionHistory', generalstock: 'StockNumber', inventorylist: 'StockNumber',
    stockithome: 'StockNumber', jobstock: 'StockNumber',
    bom: 'StockNumber', pastel: 'StockNumber',
    reconciliation: 'StockAdjustments', audit: 'StockTake', addstorage: 'StockLocation',
    assetmanagement: 'AssetManagement',
    approvals: 'StockAdjustments', rolematrix: 'UserManagement'
  };
  const pagePermAny = {
    adminhome: ['UserManagement', 'AssetManagement']
  };
  const requiredAny = pagePermAny[pageId];
  if (requiredAny && currentUser && !requiredAny.some(code => ManageITPerms.canView(code))) {
    toast('You do not have permission to access this page.', 'error');
    return;
  }
  const required = pagePerms[pageId];
  if (required && !requiredAny && currentUser && !ManageITPerms.canView(required)) {
    toast('You do not have permission to access this page.', 'error');
    return;
  }
  if (pageId === 'approvals' && currentUser && !ManageITPerms.hasAnyApprovePermission()) {
    toast('You do not have approval permissions.', 'error');
    return;
  }

  if (pageId === 'home') {
    activePortal = null;
    applyPortalUI();
  } else if (!skipPortalInfer) {
    const portal = portalForPage(pageId);
    if (portal && portal !== activePortal) {
      activePortal = portal;
      applyPortalUI();
    }
  }

  // Hide all pages
  qsa('.page').forEach(p => p.classList.remove('active'));
  qsa('.nav-item').forEach(n => n.classList.remove('active'));
  qsa('.nav-subitem').forEach(n => n.classList.remove('active'));

  // Show target page
  const page = document.getElementById('page-' + pageId);
  if (page) page.classList.add('active');

  // Mark nav active
  const navItem = qs(`[data-page="${pageId}"]`);
  if (navItem) navItem.classList.add('active');

  // Update header title
  const titles = {
    home: 'ManageIT Portals', stockithome: 'Stock-IT Home', dashboard: 'Dashboard', quickactions: 'Quick Actions',
    jobmanagement: 'Job Management', assetmanagement: 'Asset Management', generalstock: 'Inventory Management', inventorylist: 'Inventory List',
    jobstock: 'Allocated Inventory', reconciliation: 'Inventory Reconciliation',
    bom: 'BOM', pastel: 'Pastel Alignment',
    addstorage: 'Storage Locations', transactions: 'Inventory Transactions',
    audit: 'Inventory Audit', usermanagement: 'User Management',
    adduser: 'Add / Edit User', kpi: 'KPI Reports', exports: 'Export Reports',
    useractivity: 'User Activity', workactivity: 'Work Activity',
    adminhome: 'Admin Dashboard', adminusers: 'User Management', settings: 'System Settings',
    approvals: 'Pending Approvals', rolematrix: 'Role Permissions'
  };
  document.getElementById('headerTitle').textContent = titles[pageId] || pageId;

  // Refresh page data
  refreshPage(pageId);
}

function toggleSubMenu(key, el) {
  const sub = document.getElementById('sub-' + key);
  const isOpen = sub.classList.contains('open');
  // Close all
  qsa('.nav-submenu').forEach(s => s.classList.remove('open'));
  qsa('.nav-item').forEach(n => n.classList.remove('open'));
  if (!isOpen) {
    sub.classList.add('open');
    el.classList.add('open');
  }
}

function refreshPage(pageId) {
  switch(pageId) {
    case 'home': renderPortalHub(); break;
    case 'stockithome': renderStockITHome(); break;
    case 'inventorylist': renderInventoryList(); break;
    case 'dashboard': renderDashboard(); break;
    case 'jobmanagement': renderJobList(); break;
    case 'generalstock': renderStockList(); ManageITPerms.applyStockFormFields(); break;
    case 'jobstock': renderJobStockTable(); break;
    case 'transactions': renderTransactionLists(); if (typeof initSerialDropdowns === 'function') initSerialDropdowns(); break;
    case 'reconciliation': if (window.AuditWF) AuditWF.renderReconPage(); break;
    case 'bom': if (window.Engineering) Engineering.renderBom(); break;
    case 'pastel': if (window.Engineering) Engineering.renderPastel(); break;
    case 'audit': if (window.AuditWF) AuditWF.renderAuditPage(); break;
    case 'addstorage': renderStorageList(); break;
    case 'assetmanagement': renderAssetManagementPage(); break;
    case 'usermanagement': renderUserMgmtTable(); break;
    case 'adduser': renderUserList(); break;
    case 'kpi': refreshKPIs(); break;
    case 'useractivity': renderActivityTable(); break;
    case 'workactivity': renderWorkActivityTable(); break;
    case 'adminhome': renderAdminHome(); break;
    case 'adminusers': renderAdminUsersTable(); break;
    case 'approvals': renderApprovalsTable(); break;
    case 'rolematrix': renderRoleMatrix(); break;
    case 'settings': break;
  }
}

// ============================================
// POPULATE SELECT OPTIONS
// ============================================
function populateSelects() {
  qsa('#fJobType, #trFJobType').forEach(sel => { sel.innerHTML = UI.jobTypeOptions(); });
  const jtFilter = document.getElementById('jobTypeFilter');
  if (jtFilter) jtFilter.innerHTML = '<option value="">All Types</option>' + JOB_TYPES.map(t => `<option value="${UI.esc(t)}">${UI.esc(UI.jobTypeLabel(t))}</option>`).join('');

  // Job categories
  const catOpts = '<option value="">Select category…</option>' + JOB_CATEGORIES.map(c => `<option>${c}</option>`).join('');
  qsa('#fJobCategory, #fJobCatStock, #biFJobCat, #boFJobCat, #trFJobCat').forEach(sel => { sel.innerHTML = catOpts; });

  // Stock / inventory categories
  const stockCatOpts = STOCK_CATEGORIES.map(c => `<option value="${UI.esc(c)}">${UI.esc(c)}</option>`).join('');
  const stockCatFilterOpts = '<option value="">All Categories</option>' + stockCatOpts;
  const stockCatFormOpts = '<option value="">Select category…</option>' + stockCatOpts;
  qsa('#invListCatFilter, #stockCategoryFilter, #biCatFilter').forEach(sel => { sel.innerHTML = stockCatFilterOpts; });
  qsa('#fStockCategory').forEach(sel => { sel.innerHTML = stockCatFormOpts; });
  qsa('#biFCategory').forEach(sel => { sel.innerHTML = stockCatOpts; });

  // Storage locations
  refreshStorageSelects();
}

function refreshStorageSelects() {
  const locs = DB.storageLocations.map(l => l.name).concat(DEFAULT_STORAGE_LOCATIONS.filter(d => !DB.storageLocations.find(l => l.name === d)));
  const unique = [...new Set(locs)];
  const opts = '<option value="">Select location…</option>' + unique.map(l => `<option>${l}</option>`).join('');
  qsa('#fStorageLocation, #biFStoreLoc, #relFToLoc').forEach(sel => { sel.innerHTML = opts; });
}

// ============================================
// DASHBOARD & HOME
// ============================================
function renderLowStockAlerts() {
  const lowThreshold = DB.settings.lowStockThreshold || 5;
  const lowItems = DB.stock.filter(s => s.quantity > 0 && s.quantity < lowThreshold);
  const outItems = DB.stock.filter(s => s.quantity === 0);
  const count = lowItems.length + outItems.length;
  const desc = count
    ? `${lowItems.length} low inventory · ${outItems.length} out of inventory (threshold: ${lowThreshold})`
    : '';

  ['homeLowStockAlert', 'dashboardLowStockAlert'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (count > 0) {
      el.classList.remove('hidden');
      const titleEl = el.querySelector('[id$="LowStockTitle"]');
      const descEl = el.querySelector('[id$="LowStockDesc"]');
      if (titleEl) titleEl.textContent = `${count} item${count > 1 ? 's' : ''} need attention`;
      if (descEl) descEl.textContent = desc;
    } else {
      el.classList.add('hidden');
    }
  });
  if (count > 0 && typeof hydrateIcons === 'function') {
    hydrateIcons(document.getElementById('homeLowStockAlert'));
  }
}

function renderPortalHub() {
  const dateEl = document.getElementById('homeDate');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString(undefined, {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  }
  refreshLmsPortalCard();
  if (typeof hydrateIcons === 'function') hydrateIcons(document.getElementById('page-home'));
  ManageITPerms.applyNav();
}

function renderStockITHome() {
  renderLowStockAlerts();
  const dateEl = document.getElementById('stockitHomeDate');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString(undefined, {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  }
  if (typeof hydrateIcons === 'function') hydrateIcons(document.getElementById('page-stockithome'));
}

function renderHome() { renderStockITHome(); }

function renderInventoryList() {
  const q = val('invListSearch').toLowerCase();
  const cf = val('invListCatFilter');
  const items = DB.stock.filter(s =>
    (!q || s.stockNumber.toLowerCase().includes(q) || s.partDescription.toLowerCase().includes(q)) &&
    (!cf || s.stockCategory === cf)
  );
  const body = document.getElementById('invListTableBody');
  if (!body) return;
  if (!items.length) {
    body.innerHTML = '<tr class="table-empty"><td colspan="9">No inventory items found</td></tr>';
    return;
  }
  body.innerHTML = items.map(s => `
    <tr>
      <td><strong>${UI.esc(s.stockNumber)}</strong></td>
      <td>${UI.esc(s.partNumber || '—')}</td>
      <td>${UI.esc(s.partDescription)}</td>
      <td>${UI.esc(invLabel(s.stockCategory || '—'))}</td>
      <td class="${s.quantity < (DB.settings.lowStockThreshold||5) ? 'qty-low' : 'qty-ok'}">${s.quantity}</td>
      <td>${UI.esc(s.storageLocation || '—')}</td>
      <td>${UI.esc(s.trayBin || '—')}</td>
      <td>${UI.esc(s.serialNumber || '—')}</td>
      <td><button class="btn btn-sm btn-outline" onclick="viewStockRegister('${s.id}')">Register</button></td>
    </tr>
  `).join('');
}

function toggleActivityFeed() {
  UI.activityExpanded = !UI.activityExpanded;
  const btn = document.getElementById('activityShowMoreBtn');
  if (btn) btn.textContent = UI.activityExpanded ? 'Show less activity' : 'Show more activity';
  renderDashboard();
}

function renderDashboard() {
  const lowThreshold = DB.settings.lowStockThreshold || 5;
  document.getElementById('statTotalStock').textContent = DB.stock.length;
  document.getElementById('statLowStock').textContent = DB.stock.filter(s => s.quantity < lowThreshold).length;
  document.getElementById('statActiveJobs').textContent = DB.jobs.filter(j => j.status === 'Active').length;
  document.getElementById('statTotalUsers').textContent = DB.users.length;
  document.getElementById('statOutOfStock').textContent = DB.stock.filter(s => s.quantity === 0).length;
  document.getElementById('statStorageLocations').textContent = DB.storageLocations.length || DEFAULT_STORAGE_LOCATIONS.length;
  renderLowStockAlerts();

  const feed = document.getElementById('activityFeed');
  const limit = UI.activityExpanded ? 50 : UI.activityLimit;
  const items = DB.activity.slice(0, limit);
  const meta = document.getElementById('activityFeedMeta');
  if (meta) meta.textContent = UI.activityExpanded ? `Showing ${items.length} events` : 'Last 10 events';
  const moreWrap = document.getElementById('activityShowMoreWrap');
  if (moreWrap) moreWrap.classList.toggle('hidden', DB.activity.length <= UI.activityLimit);

  if (!items.length) {
    feed.innerHTML = emptyState('inbox', 'No activity yet');
    return;
  }
  const dotClass = a => {
    const t = a.actionPerformed.toLowerCase();
    if (t.includes('login')) return 'login';
    if (t.includes('add') || t.includes('book in') || t.includes('create')) return 'add';
    if (t.includes('edit') || t.includes('update') || t.includes('transfer')) return 'edit';
    if (t.includes('delete') || t.includes('book out')) return 'delete';
    return 'default';
  };
  const actionIcon = a => {
    const t = a.actionPerformed.toLowerCase();
    if (t.includes('login')) return icon('key', 16, '');
    if (t.includes('book in')) return icon('download', 16, '');
    if (t.includes('book out')) return icon('upload', 16, '');
    if (t.includes('transfer')) return icon('refresh', 16, '');
    if (t.includes('add') || t.includes('create')) return icon('plus', 16, '');
    if (t.includes('delete')) return icon('trash', 16, '');
    if (t.includes('edit') || t.includes('update')) return icon('edit', 16, '');
    return icon('pin', 16, '');
  };
  feed.innerHTML = items.map(a => `
    <div class="activity-item">
      <div class="activity-dot ${dotClass(a)}" aria-hidden="true">${actionIcon(a)}</div>
      <div class="activity-info">
        <div class="activity-title">${UI.esc(a.userName)} — ${UI.esc(a.actionPerformed)}</div>
        <div class="activity-desc">${UI.esc(a.activityDescription)}</div>
      </div>
      <div class="activity-time">
        <div class="activity-time-relative">${UI.formatRelativeTime(a.timestamp)}</div>
        <div style="font-size:10px;color:var(--text-light)">${fmtDateTime(a.timestamp)}</div>
      </div>
    </div>
  `).join('');
}

// ============================================
// JOB MANAGEMENT
// ============================================
function clearJobFilters() {
  setVal('jobSearch', '');
  setVal('jobTypeFilter', '');
  renderJobList();
}

function renderJobList() {
  const q = val('jobSearch').toLowerCase();
  const typeF = val('jobTypeFilter');
  const total = DB.jobs.length;
  let items = DB.jobs.filter(j =>
    (!q || j.jobNumber.toLowerCase().includes(q) || j.jobDescription.toLowerCase().includes(q)) &&
    (!typeF || j.jobType === typeF)
  );
  document.getElementById('jobCount').textContent = items.length + ' records';
  const list = document.getElementById('jobList');
  if (!total) {
    list.innerHTML = UI.emptyListState('clipboard', 'jobs', 'jobForm', '+ Add Job');
    return;
  }
  if (!items.length) {
    list.innerHTML = UI.noResultsState('clipboard', 'clearJobFilters');
    return;
  }
  const statusColor = s => ({ Active: 'badge-active', 'On Hold': 'badge-user', Completed: 'badge-admin', Cancelled: 'badge-inactive' }[s] || 'badge-inactive');
  list.innerHTML = items.map(j => `
    <div class="list-item ${selectedJobId === j.id ? 'selected' : ''}" role="option" aria-selected="${selectedJobId === j.id}" tabindex="0" data-id="${UI.esc(j.id)}" onclick="selectJob('${UI.esc(j.id)}')" onkeydown="if(event.key==='Enter')selectJob('${UI.esc(j.id)}')">
      <div class="list-item-avatar" title="${UI.esc(UI.jobTypeDescription(j.jobType) || j.jobType)}">${UI.esc(j.jobType || '?')}</div>
      <div class="list-item-info">
        <div class="list-item-primary">${UI.esc(j.jobNumber)}</div>
        <div class="list-item-secondary">${UI.esc(j.jobDescription)}</div>
      </div>
      <span class="list-item-badge ${statusColor(j.status)}">${UI.esc(j.status)}</span>
    </div>
  `).join('');
}

function selectJob(id) {
  if (selectedJobId === id) return;
  FormDirty.guard('jobForm', () => applySelectJob(id));
}

function applySelectJob(id) {
  selectedJobId = id;
  const job = DB.jobs.find(j => j.id === id);
  if (!job) return;
  FormDirty.clear('jobForm');
  show(document.getElementById('jobFormContent'));
  hide(document.getElementById('jobFormEmpty'));
  document.getElementById('jobFormTitle').textContent = 'Edit Job';
  document.getElementById('jobFormSub').textContent = job.jobNumber;
  document.getElementById('jobFormBadge').textContent = 'EDIT';
  document.getElementById('jobFormBadge').className = 'form-mode-badge edit';
  setVal('fJobNumber', job.jobNumber);
  setVal('fJobType', job.jobType);
  setVal('fJobDesc', job.jobDescription);
  setVal('fJobOrderConf', job.orderConfirmation);
  setVal('fJobCategory', job.category);
  setVal('fJobStatus', job.status);
  show(document.getElementById('jobDeleteBtn'));
  renderJobList();
  UI.scrollToPanel('jobFormPanel');
}

function jobForm(mode) {
  FormDirty.guard('jobForm', () => {
    selectedJobId = null;
    FormDirty.clear('jobForm');
    show(document.getElementById('jobFormContent'));
    hide(document.getElementById('jobFormEmpty'));
    document.getElementById('jobFormTitle').textContent = 'Add Job';
    document.getElementById('jobFormSub').textContent = 'Fill in the details below';
    document.getElementById('jobFormBadge').textContent = 'NEW';
    document.getElementById('jobFormBadge').className = 'form-mode-badge add';
    ['fJobNumber','fJobDesc','fJobOrderConf'].forEach(id => setVal(id,''));
    setVal('fJobType',''); setVal('fJobCategory',''); setVal('fJobStatus','Active');
    hide(document.getElementById('jobDeleteBtn'));
    renderJobList();
    UI.scrollToPanel('jobFormPanel');
    document.getElementById('fJobNumber')?.focus();
  });
}

function jobFormClear() {
  selectedJobId = null;
  FormDirty.clear('jobForm');
  hide(document.getElementById('jobFormContent'));
  show(document.getElementById('jobFormEmpty'));
  renderJobList();
}

async function saveJob() {
  UI.clearFormErrors(['fJobNumber', 'fJobType', 'fJobDesc']);
  const valid = UI.validateRequired([
    { id: 'fJobNumber', message: 'Enter a job number' },
    { id: 'fJobType', message: 'Select a job type' },
    { id: 'fJobDesc', message: 'Enter a job description' }
  ]);
  if (!valid) return toast('Please fix the highlighted fields', 'error');

  const jobNumber = val('fJobNumber');
  const jobType = val('fJobType');
  const jobDesc = val('fJobDesc');
  const jobPayload = {
    jobNumber,
    jobType,
    jobDescription: jobDesc,
    orderConfirmation: val('fJobOrderConf'),
    category: val('fJobCategory'),
    status: val('fJobStatus') || 'Active'
  };

  const btn = document.getElementById('jobSaveBtn');
  await UI.withButtonLoading(btn, 'Saving…', async () => {
    if (DB.useApi && DB._apiReady && ManageITApi.getToken()) {
      if (selectedJobId) {
        const updated = await ManageITApi.updateJob(selectedJobId, jobPayload);
        const idx = DB.jobs.findIndex(j => j.id === selectedJobId);
        if (idx >= 0) DB.jobs[idx] = updated;
        DB.logActivity(currentUser.firstName + ' ' + currentUser.lastName, 'Edit Job', 'Job Management', `Updated job ${jobNumber}`);
        toast('Job updated successfully', 'success');
      } else {
        const created = await ManageITApi.createJob(jobPayload);
        DB.jobs.push(created);
        DB.logActivity(currentUser.firstName + ' ' + currentUser.lastName, 'Add Job', 'Job Management', `Created job ${jobNumber}`);
        toast('Job added successfully', 'success');
      }
      DB.cacheLocal();
      FormDirty.clear('jobForm');
      renderJobList();
      renderJobStockTable();
      return;
    }

    if (selectedJobId) {
      const idx = DB.jobs.findIndex(j => j.id === selectedJobId);
      DB.jobs[idx] = { ...DB.jobs[idx], ...jobPayload };
      DB.logActivity(currentUser.firstName + ' ' + currentUser.lastName, 'Edit Job', 'Job Management', `Updated job ${jobNumber}`);
      toast('Job updated successfully', 'success');
    } else {
      if (DB.jobs.find(j => j.jobNumber === jobNumber)) return toast('Job number already exists', 'error');
      DB.jobs.push({ id: uid(), ...jobPayload, createdAt: new Date().toISOString() });
      DB.logActivity(currentUser.firstName + ' ' + currentUser.lastName, 'Add Job', 'Job Management', `Created job ${jobNumber}`);
      toast('Job added successfully', 'success');
    }
    FormDirty.clear('jobForm');
    DB.save();
    renderJobList();
    renderJobStockTable();
  }).catch(err => toast(err.message || 'Failed to save job', 'error'));
}

function deleteJobConfirm() {
  const job = DB.jobs.find(j => j.id === selectedJobId);
  if (!job) return;
  confirm('Delete Job', `Are you sure you want to delete job "${job.jobNumber} — ${job.jobDescription}"? This cannot be undone.`, 'Delete', 'btn-danger', async () => {
    if (DB.useApi && DB._apiReady && ManageITApi.getToken()) {
      try {
        await ManageITApi.deleteJob(selectedJobId);
        DB.jobs = DB.jobs.filter(j => j.id !== selectedJobId);
        DB.logActivity(currentUser.firstName + ' ' + currentUser.lastName, 'Delete Job', 'Job Management', `Deleted job ${job.jobNumber}`);
        DB.cacheLocal();
        selectedJobId = null;
        jobFormClear();
        toast('Job deleted', 'success');
        return;
      } catch (err) {
        toast(err.message || 'Failed to delete job', 'error');
        return;
      }
    }
    DB.jobs = DB.jobs.filter(j => j.id !== selectedJobId);
    DB.logActivity(currentUser.firstName + ' ' + currentUser.lastName, 'Delete Job', 'Job Management', `Deleted job ${job.jobNumber}`);
    DB.save(); selectedJobId = null; jobFormClear(); toast('Job deleted', 'success');
  });
}

// ============================================
// STOCK MANAGEMENT
// ============================================
function clearStockFilters() {
  setVal('stockSearch', '');
  setVal('stockCategoryFilter', '');
  renderStockList();
}

function renderStockList() {
  const q = val('stockSearch').toLowerCase();
  const catF = val('stockCategoryFilter');
  const total = DB.stock.length;
  let items = DB.stock.filter(s =>
    (!q || s.stockNumber.toLowerCase().includes(q) || s.partDescription.toLowerCase().includes(q) || s.partNumber.toLowerCase().includes(q)) &&
    (!catF || s.stockCategory === catF)
  );
  document.getElementById('stockCount').textContent = items.length + ' records';
  const list = document.getElementById('stockList');
  const catClass = stockCategoryClass;
  if (!total) {
    list.innerHTML = UI.emptyListState('package', 'stock items', 'stockForm', '+ Add Stock Item');
    return;
  }
  if (!items.length) {
    list.innerHTML = UI.noResultsState('package', 'clearStockFilters');
    return;
  }
  list.innerHTML = items.map(s => `
    <div class="list-item ${selectedStockId === s.id ? 'selected' : ''}" role="option" aria-selected="${selectedStockId === s.id}" tabindex="0" onclick="selectStock('${UI.esc(s.id)}')">
      <div class="list-item-avatar" style="font-size:11px">${UI.esc(s.stockNumber.slice(-4))}</div>
      <div class="list-item-info">
        <div class="list-item-primary">${UI.esc(s.stockNumber)} — ${UI.esc(s.partDescription)}</div>
        <div class="list-item-secondary">${UI.esc(s.partNumber || '—')} &nbsp;·&nbsp; Qty: <strong class="${s.quantity < (DB.settings.lowStockThreshold||5) ? 'qty-low' : 'qty-ok'}">${s.quantity}</strong></div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0">
        <span class="stock-badge ${catClass(s.stockCategory)}">${UI.esc(normaliseStockCategory(s.stockCategory) || s.stockCategory || '—')}</span>
        <button type="button" class="btn btn-outline btn-sm" style="padding:2px 6px;font-size:10px" onclick="event.stopPropagation();viewStockRegister('${UI.esc(s.id)}')" title="Register">${icon('history', 14, '')}</button>
      </div>
    </div>
  `).join('');
}

function selectStock(id) {
  if (selectedStockId === id) return;
  FormDirty.guard('stockForm', () => applySelectStock(id));
}

function applySelectStock(id) {
  selectedStockId = id;
  const s = DB.stock.find(x => x.id === id);
  if (!s) return;
  FormDirty.clear('stockForm');
  show(document.getElementById('stockFormContent'));
  hide(document.getElementById('stockFormEmpty'));
  document.getElementById('stockFormTitle').textContent = 'Edit Stock Item';
  document.getElementById('stockFormSub').textContent = s.stockNumber;
  document.getElementById('stockFormBadge').textContent = 'EDIT';
  document.getElementById('stockFormBadge').className = 'form-mode-badge edit';
  setVal('fStockCategory', s.stockCategory);
  setVal('fStockNumber', s.stockNumber);
  setVal('fPartNumber', s.partNumber);
  setVal('fSerialNumber', s.serialNumber);
  setVal('fPartDesc', s.partDescription);
  setVal('fQty', s.quantity);
  setVal('fPoNumber', s.poNumber);
  setVal('fStorageLocation', s.storageLocation);
  setVal('fTrayBin', s.trayBin);
  setVal('fStockJobNum', s.jobNumber);
  setVal('fJobCatStock', s.jobCategory);
  show(document.getElementById('stockDeleteBtn'));
  renderStockList();
  UI.scrollToPanel('stockFormPanel');
}

function stockForm(mode) {
  FormDirty.guard('stockForm', () => {
    selectedStockId = null;
    FormDirty.clear('stockForm');
    show(document.getElementById('stockFormContent'));
    hide(document.getElementById('stockFormEmpty'));
    document.getElementById('stockFormTitle').textContent = 'Add Stock Item';
    document.getElementById('stockFormSub').textContent = 'Fill in the details below';
    document.getElementById('stockFormBadge').textContent = 'NEW';
    document.getElementById('stockFormBadge').className = 'form-mode-badge add';
    ['fStockCategory','fStockNumber','fPartNumber','fSerialNumber','fPartDesc','fPoNumber','fStorageLocation','fTrayBin','fStockJobNum','fJobCatStock'].forEach(id => setVal(id,''));
    setVal('fQty', 0);
    hide(document.getElementById('stockDeleteBtn'));
    renderStockList();
    UI.scrollToPanel('stockFormPanel');
    document.getElementById('fStockNumber')?.focus();
  });
}

function stockFormClear() {
  selectedStockId = null;
  hide(document.getElementById('stockFormContent'));
  show(document.getElementById('stockFormEmpty'));
  renderStockList();
}

async function saveStock() {
  if (!ManageITPerms.canEdit('StockNumber')) return toast('You have view-only access to stock master data.', 'error');
  UI.clearFormErrors(['fStockNumber', 'fPartDesc', 'fStockCategory']);
  const valid = UI.validateRequired([
    { id: 'fStockNumber', message: 'Enter a stock number' },
    { id: 'fPartDesc', message: 'Enter a part description' },
    { id: 'fStockCategory', message: 'Select a category' }
  ]);
  if (!valid) return toast('Please fix the highlighted fields', 'error');

  const stockNumber = val('fStockNumber');
  const partDesc = val('fPartDesc');
  const qty = parseInt(val('fQty')) || 0;
  const cat = val('fStockCategory');
  const stockPayload = {
    stockNumber, stockCategory: cat, partNumber: val('fPartNumber'),
    serialNumber: val('fSerialNumber'), partDescription: partDesc,
    quantity: qty, poNumber: val('fPoNumber'), storageLocation: val('fStorageLocation'),
    trayBin: val('fTrayBin'), jobNumber: val('fStockJobNum'), jobCategory: val('fJobCatStock')
  };

  const btn = document.getElementById('stockSaveBtn');
  await UI.withButtonLoading(btn, 'Saving…', async () => {
    if (DB.useApi && DB._apiReady && ManageITApi.getToken()) {
      if (selectedStockId) {
        const updated = await ManageITApi.updateStock(selectedStockId, stockPayload);
        const idx = DB.stock.findIndex(s => s.id === selectedStockId);
        if (idx >= 0) DB.stock[idx] = updated;
        DB.logActivity(currentUser.firstName + ' ' + currentUser.lastName, 'Edit Stock', 'General Stock Management', `Updated stock ${stockNumber}`, stockNumber, qty);
        toast('Stock item updated', 'success');
      } else {
        const created = await ManageITApi.createStock(stockPayload);
        DB.stock.push(created);
        DB.logActivity(currentUser.firstName + ' ' + currentUser.lastName, 'Add Stock', 'General Stock Management', `Added stock ${stockNumber}`, stockNumber, qty);
        toast('Stock item added', 'success');
      }
      DB.cacheLocal();
      FormDirty.clear('stockForm');
      renderStockList();
      return;
    }

    if (selectedStockId) {
      const idx = DB.stock.findIndex(s => s.id === selectedStockId);
      DB.stock[idx] = { ...DB.stock[idx], ...stockPayload };
      DB.logActivity(currentUser.firstName + ' ' + currentUser.lastName, 'Edit Stock', 'General Stock Management', `Updated stock ${stockNumber}`, stockNumber, qty);
      toast('Stock item updated (saved locally)', 'success');
    } else {
      if (DB.stock.find(s => s.stockNumber === stockNumber)) { toast('Stock number already exists', 'error'); throw new Error('duplicate'); }
      DB.stock.push({ id: uid(), ...stockPayload, createdAt: new Date().toISOString() });
      DB.logActivity(currentUser.firstName + ' ' + currentUser.lastName, 'Add Stock', 'General Stock Management', `Added stock ${stockNumber}`, stockNumber, qty);
      toast('Stock item added (saved locally)', 'success');
    }
    FormDirty.clear('stockForm');
    DB.save();
    renderStockList();
  }).catch(err => { if (err.message !== 'duplicate') toast(err.message || 'Failed to save stock', 'error'); });
}

function deleteStockConfirm() {
  const s = DB.stock.find(x => x.id === selectedStockId);
  if (!s) return;
  confirm('Delete Stock Item', `Delete stock item "${s.stockNumber} — ${s.partDescription}"?`, 'Delete', 'btn-danger', async () => {
    if (DB.useApi && DB._apiReady && ManageITApi.getToken()) {
      try {
        await ManageITApi.deleteStock(selectedStockId);
        DB.stock = DB.stock.filter(x => x.id !== selectedStockId);
        DB.logActivity(currentUser.firstName + ' ' + currentUser.lastName, 'Delete Stock', 'General Stock', `Deleted ${s.stockNumber}`);
        DB.cacheLocal();
        selectedStockId = null;
        stockFormClear();
        toast('Stock item deleted', 'success');
        return;
      } catch (err) {
        toast(err.message || 'Failed to delete stock item', 'error');
        return;
      }
    }
    DB.stock = DB.stock.filter(x => x.id !== selectedStockId);
    DB.logActivity(currentUser.firstName + ' ' + currentUser.lastName, 'Delete Stock', 'General Stock', `Deleted ${s.stockNumber}`);
    DB.save(); selectedStockId = null; stockFormClear(); toast('Stock item deleted', 'success');
  });
}

// ============================================
// JOB SPECIFIC STOCK TABLE
// ============================================
function renderJobStockTable() {
  const q = val('jobStockSearch').toLowerCase();
  const jobF = val('jobStockJobFilter');

  // Populate job filter
  const jf = document.getElementById('jobStockJobFilter');
  const curVal = jf.value;
  jf.innerHTML = '<option value="">All Jobs</option>' + DB.jobs.map(j => `<option value="${j.jobNumber}">${j.jobNumber}</option>`).join('');
  jf.value = curVal;

  let items = DB.stock.filter(s => s.jobNumber && s.jobNumber.trim() &&
    (!q || s.stockNumber.toLowerCase().includes(q) || s.partDescription.toLowerCase().includes(q) || s.jobNumber.toLowerCase().includes(q)) &&
    (!jobF || s.jobNumber === jobF)
  );
  const body = document.getElementById('jobStockTableBody');
  if (!items.length) {
    body.innerHTML = '<tr class="table-empty"><td colspan="8">No allocated inventory found</td></tr>';
    return;
  }
  body.innerHTML = items.map(s => `
    <tr>
      <td><strong>${s.stockNumber}</strong></td>
      <td>${s.partNumber || '—'}</td>
      <td>${s.partDescription}</td>
      <td><span class="list-item-badge badge-user">${s.jobNumber}</span></td>
      <td>${s.jobCategory || '—'}</td>
      <td class="${s.quantity < (DB.settings.lowStockThreshold||5) ? 'qty-low' : 'qty-ok'}">${s.quantity}</td>
      <td>${s.storageLocation || '—'}</td>
      <td>${s.trayBin || '—'}</td>
    </tr>
  `).join('');
}

// ============================================
// TRANSACTIONS (Book In / Out / Transfer)
// ============================================

// Tracks which stock item ID is currently bound to each transaction panel
const txSelectedIds = { bookin: null, bookout: null, transfer: null, relocation: null, adjustment: null };
let transferReverse = false;

function txCommentValue(fieldId) {
  return val(fieldId).trim();
}

function requireTransferComment() {
  UI.clearFormErrors(['trFComment']);
  const comment = txCommentValue('trFComment');
  if (!comment) {
    UI.setFieldError('trFComment', 'Comment/reason is required for job transfers');
    toast('Enter a comment/reason for this transfer', 'error');
    return null;
  }
  return comment;
}

function txQtyDisplay(t) {
  if (t.type === 'Relocation') return String(t.quantity);
  if (t.qtyBefore != null && t.qtyAfter != null) {
    const diff = t.qtyAfter - t.qtyBefore;
    if (diff === 0) return '0';
    return `${diff > 0 ? '+' : ''}${Math.abs(diff)}`;
  }
  const outbound = t.type === 'Book Out' || t.type === 'Transfer OUT';
  return `${outbound ? '-' : '+'}${t.quantity}`;
}

function txQtyColor(t) {
  if (t.type === 'Relocation') return 'var(--text)';
  if (t.qtyBefore != null && t.qtyAfter != null) {
    const diff = t.qtyAfter - t.qtyBefore;
    if (diff < 0) return 'var(--danger)';
    if (diff > 0) return '#27ae60';
    return 'var(--text-muted)';
  }
  return (t.type === 'Book Out' || t.type === 'Transfer OUT') ? 'var(--danger)' : '#27ae60';
}

function setTransactionTab(tab) {
  const panelMap = { receipt: 'txReceipt', relocation: 'txRelocation', transfer: 'txTransfer', adjustment: 'txAdjustment', history: 'txHistory', bookin: 'txReceipt' };
  const tabMap   = { receipt: 'tabReceipt', relocation: 'tabRelocation', transfer: 'tabTransfer', adjustment: 'tabAdjustment', history: 'tabHistory' };
  Object.keys(panelMap).forEach(k => {
    const panel = document.getElementById(panelMap[k]);
    const tabBtn = document.getElementById(tabMap[k]);
    if (panel) panel.classList.add('hidden');
    if (tabBtn) tabBtn.classList.remove('active');
  });
  const key = tab === 'bookin' ? 'receipt' : tab;
  const panel = document.getElementById(panelMap[key]);
  const tabBtn = document.getElementById(tabMap[key]);
  if (panel) panel.classList.remove('hidden');
  if (tabBtn) tabBtn.classList.add('active');
  if (key === 'history') renderTxHistory();
  else renderTransactionLists();
}

function renderTransactionLists() {
  renderBookInList(); renderTransferList(); renderRelocationList(); renderAdjustmentList();
}

// ---- Shared helpers ----
function txStatusBar(elId, item, mode = 'bookin') {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!item) { el.style.display = 'none'; return; }
  const low = DB.settings.lowStockThreshold || 5;
  const isLow = item.quantity < low;
  const bgColor = mode === 'bookin' ? '#e8f8f0' : isLow ? '#fdf0ef' : '#e8f8f0';
  const borderColor = mode === 'bookin' ? '#27ae60' : isLow ? 'var(--danger)' : '#27ae60';
  el.style.display = 'block';
  el.style.background = bgColor;
  el.style.borderColor = borderColor;
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
      <div><span style="color:var(--text-muted)">Inventory #</span> <strong>${item.stockNumber}</strong></div>
      <div><span style="color:var(--text-muted)">Current Qty</span> <strong style="color:${isLow ? 'var(--danger)' : '#27ae60'}">${item.quantity}</strong></div>
      <div><span style="color:var(--text-muted)">Location</span> <strong>${item.storageLocation || '—'}</strong></div>
      ${item.trayBin ? `<div><span style="color:var(--text-muted)">Bin</span> <strong>${item.trayBin}</strong></div>` : ''}
      <button class="btn btn-outline btn-sm" style="margin-left:auto" onclick="viewStockRegister('${item.id}')">${iconLabel('history', 'Register', 14)}</button>
    </div>`;
}

// ---- BOOK IN ----
function renderBookInList() {
  const q = val('biSearch').toLowerCase();
  const cf = val('biCatFilter');
  const items = DB.stock.filter(s =>
    (!q || s.stockNumber.toLowerCase().includes(q) || s.partDescription.toLowerCase().includes(q)) &&
    (!cf || s.stockCategory === cf)
  );
  document.getElementById('biCount').textContent = items.length + ' records';
  const catClass = stockCategoryClass;
  document.getElementById('biList').innerHTML = items.length ? items.map(s => `
    <div class="list-item ${txSelectedIds.bookin === s.id ? 'selected' : ''}" onclick="biSelectStock('${s.id}')">
      <div class="list-item-avatar" style="font-size:11px">${s.stockNumber.slice(-4)}</div>
      <div class="list-item-info">
        <div class="list-item-primary">${s.stockNumber}</div>
        <div class="list-item-secondary">${s.partDescription} — Qty: <strong>${s.quantity}</strong></div>
      </div>
      <span class="stock-badge ${catClass(s.stockCategory)}">${normaliseStockCategory(s.stockCategory) || s.stockCategory || '—'}</span>
    </div>
  `).join('') : emptyState('package', 'No items — new stock number will create a new record');
}

function biSelectStock(id) {
  const s = DB.stock.find(x => x.id === id);
  if (!s) return;
  txSelectedIds.bookin = id;
  setVal('biFStockNum', s.stockNumber);
  setVal('biFPartNum', s.partNumber);
  setVal('biFPartDesc', s.partDescription);
  setVal('biFSerial', s.serialNumber);
  refreshSerialSelect('biFSerial', s.serialNumber);
  setVal('biFCategory', s.stockCategory);
  setVal('biFStoreLoc', s.storageLocation);
  setVal('biFTrayBin', s.trayBin);
  setVal('biFJobNum', s.jobNumber);
  setVal('biFJobCat', s.jobCategory);
  txStatusBar('biStatusBar', s, 'bookin');
  renderBookInList();
}

// Auto-lookup when user types a stock number (e.g. barcode scan)
function biLookupStock() {
  const num = val('biFStockNum').trim();
  if (!num) { txSelectedIds.bookin = null; txStatusBar('biStatusBar', null); renderBookInList(); return; }
  const s = DB.stock.find(x => x.stockNumber === num);
  if (s) {
    txSelectedIds.bookin = s.id;
    setVal('biFPartNum', s.partNumber);
    setVal('biFPartDesc', s.partDescription);
    setVal('biFSerial', s.serialNumber);
    refreshSerialSelect('biFSerial', s.serialNumber);
    setVal('biFCategory', s.stockCategory);
    setVal('biFStoreLoc', s.storageLocation);
    setVal('biFTrayBin', s.trayBin);
    setVal('biFJobNum', s.jobNumber);
    setVal('biFJobCat', s.jobCategory);
    txStatusBar('biStatusBar', s, 'bookin');
  } else {
    txSelectedIds.bookin = null;
    const el = document.getElementById('biStatusBar');
    el.style.display = 'block';
    el.style.background = '#fff3e0';
    el.style.borderColor = 'var(--warning)';
    el.innerHTML = `<span class="icon-inline" style="color:var(--warning)">${icon('warning', 16, '')}<span>Stock number not found — a <strong>new stock record</strong> will be created on Book-In.</span></span>`;
  }
  renderBookInList();
  updateTxSteps('bi', num ? 2 : 1);
}

function setBookInMode(mode) {
  bookInMode = mode;
  document.getElementById('biModeGeneral').classList.toggle('active', mode === 'general');
  document.getElementById('biModeJob').classList.toggle('active', mode === 'job');
  document.getElementById('biModeLabel').textContent = mode === 'job' ? 'Job allocation mode' : 'Production / Service Inventory mode';
  qsa('.bi-job-field').forEach(el => el.style.display = mode === 'job' ? '' : 'none');
}

function updateTxSteps(prefix, step) {
  [1, 2, 3].forEach(n => {
    document.getElementById(`${prefix}Step${n}`)?.classList.toggle('active', n === step);
  });
}

function submitBookIn() {
  if (!ManageITPerms.canEdit('StockReceiving')) return toast('You do not have permission to book in stock.', 'error');
  UI.clearFormErrors(['biFStockNum', 'biFQty']);
  const stockNum = val('biFStockNum');
  const qty = parseInt(val('biFQty')) || 0;
  if (!stockNum) { UI.setFieldError('biFStockNum', 'Enter or scan an inventory number'); return toast('Enter an Inventory Number', 'error'); }
  if (qty < 1) { UI.setFieldError('biFQty', 'Enter a valid quantity'); return toast('Enter a valid quantity', 'error'); }
  updateTxSteps('bi', 3);

  const btn = document.getElementById('biSubmitBtn');
  UI.withButtonLoading(btn, 'Booking in…', async () => {
  // Use bound ID if available, otherwise look up by stock number
  let item = txSelectedIds.bookin ? DB.stock.find(s => s.id === txSelectedIds.bookin) : null;
  if (!item) item = DB.stock.find(s => s.stockNumber === stockNum);

  const qtyBefore = item ? item.quantity : 0;
  const isNewStock = !item;

  if (item) {
    item.quantity += qty;
    if (val('biFStoreLoc')) item.storageLocation = val('biFStoreLoc');
    if (val('biFTrayBin')) item.trayBin = val('biFTrayBin');
    if (val('biFPartNum')) item.partNumber = val('biFPartNum');
    if (val('biFPartDesc')) item.partDescription = val('biFPartDesc');
  } else {
    item = {
      id: uid(), stockNumber: stockNum, partNumber: val('biFPartNum'),
      partDescription: val('biFPartDesc') || stockNum, serialNumber: val('biFSerial'),
      quantity: qty, stockCategory: val('biFCategory') || 'Production Inventory',
      storageLocation: val('biFStoreLoc'), trayBin: val('biFTrayBin'),
      poNumber: val('biFPoNum'), jobNumber: val('biFJobNum'), jobCategory: val('biFJobCat'),
      createdAt: new Date().toISOString()
    };
    DB.stock.push(item);
  }

  const tx = {
    id: uid(), type: 'Receipt',
    stockItemId: item.id, stockNumber: stockNum,
    partNumber: item.partNumber, partDescription: item.partDescription,
    quantity: qty, qtyBefore, qtyAfter: item.quantity,
    storageLocation: val('biFStoreLoc') || item.storageLocation,
    poNumber: val('biFPoNum'), jobNumber: val('biFJobNum'),
    comment: txCommentValue('biFComment'),
    userName: currentUser.firstName + ' ' + currentUser.lastName,
    timestamp: new Date().toISOString()
  };

  if (isApiMode()) {
    await persistStockItem(item, isNewStock);
    await persistTransaction(tx);
    DB.transactions.unshift(tx);
    DB.cacheLocal();
  } else {
    DB.transactions.unshift(tx);
    DB.save();
  }

  DB.logActivity(currentUser.firstName + ' ' + currentUser.lastName, 'Receipt', 'Inventory Transactions',
    `Received ${qty} x ${stockNum} (bal: ${qtyBefore} → ${item.quantity})`, stockNum, qty);
  UI.showTxSuccess('biSuccessBanner', `<strong>${UI.esc(stockNum)}</strong> · Qty now <strong>${item.quantity}</strong>${val('biFStoreLoc') ? ' · ' + UI.esc(val('biFStoreLoc')) : ''}${val('biFTrayBin') ? ' · Bin ' + UI.esc(val('biFTrayBin')) : ''}`);

  txSelectedIds.bookin = item.id;
  txStatusBar('biStatusBar', item, 'bookin');
  setVal('biFQty', '');
  setVal('biFComment', '');
  updateTxSteps('bi', 1);
  renderBookInList();
  });
}

// ---- BOOK OUT ----
function renderBookOutList() {
  const q = val('boSearch').toLowerCase();
  const cf = val('boCatFilter');
  const items = DB.stock.filter(s =>
    (!q || s.stockNumber.toLowerCase().includes(q) || s.partDescription.toLowerCase().includes(q)) &&
    (!cf || s.stockCategory === cf)
  );
  document.getElementById('boCount').textContent = items.length + ' records';
  const catClass = stockCategoryClass;
  const low = DB.settings.lowStockThreshold || 5;
  document.getElementById('boList').innerHTML = items.length ? items.map(s => `
    <div class="list-item ${txSelectedIds.bookout === s.id ? 'selected' : ''}" onclick="boSelectStock('${s.id}')">
      <div class="list-item-avatar" style="font-size:11px">${s.stockNumber.slice(-4)}</div>
      <div class="list-item-info">
        <div class="list-item-primary">${s.stockNumber}</div>
        <div class="list-item-secondary">${s.partDescription} — Avail: <strong class="${s.quantity < low ? 'qty-low' : 'qty-ok'}">${s.quantity}</strong></div>
      </div>
      <span class="stock-badge ${catClass(s.stockCategory)}">${normaliseStockCategory(s.stockCategory) || s.stockCategory || '—'}</span>
    </div>
  `).join('') : emptyState('package', 'No stock available');
}

function boSelectStock(id) {
  const s = DB.stock.find(x => x.id === id);
  if (!s) return;
  txSelectedIds.bookout = id;
  setVal('boFStockNum', s.stockNumber);
  setVal('boFPartNum', s.partNumber);
  setVal('boFPartDesc', s.partDescription);
  setVal('boFSerial', s.serialNumber);
  refreshSerialSelect('boFSerial', s.serialNumber);
  setVal('boFStoreLoc', s.storageLocation);
  setVal('boFTrayBin', s.trayBin);
  txStatusBar('boStatusBar', s, 'bookout');
  renderBookOutList();
}

// Auto-lookup when typing / scanning
function boLookupStock() {
  const num = val('boFStockNum').trim();
  if (!num) { txSelectedIds.bookout = null; txStatusBar('boStatusBar', null); renderBookOutList(); return; }
  const s = DB.stock.find(x => x.stockNumber === num);
  if (s) {
    txSelectedIds.bookout = s.id;
    setVal('boFPartNum', s.partNumber);
    setVal('boFPartDesc', s.partDescription);
    setVal('boFSerial', s.serialNumber);
    refreshSerialSelect('boFSerial', s.serialNumber);
    setVal('boFStoreLoc', s.storageLocation);
    setVal('boFTrayBin', s.trayBin);
    txStatusBar('boStatusBar', s, 'bookout');
  } else {
    txSelectedIds.bookout = null;
    const el = document.getElementById('boStatusBar');
    el.style.display = 'block';
    el.style.background = '#fdf0ef';
    el.style.borderColor = 'var(--danger)';
    el.innerHTML = `<span class="icon-inline" style="color:var(--danger)">${icon('x', 16, '')}<span>Stock number "<strong>${num}</strong>" not found in register.</span></span>`;
  }
  renderBookOutList();
}

// Warn if qty entered exceeds available
function boValidateQty() {
  const item = txSelectedIds.bookout ? DB.stock.find(s => s.id === txSelectedIds.bookout) : null;
  if (!item) return;
  const qty = parseInt(val('boFQty')) || 0;
  if (qty > item.quantity) toast(`Only ${item.quantity} available`, 'warning');
}

function setBookOutMode(mode) {
  bookOutMode = mode;
  document.getElementById('boModeGeneral').classList.toggle('active', mode === 'general');
  document.getElementById('boModeJob').classList.toggle('active', mode === 'job');
  document.getElementById('boModeLabel').textContent = mode === 'job' ? 'Job allocation mode' : 'Production / Service Inventory mode';
  qsa('.bo-job-field').forEach(el => el.style.display = mode === 'job' ? '' : 'none');
}

function submitBookOut() {
  if (!ManageITPerms.canEdit('StockIssuing')) return toast('You do not have permission to book out stock.', 'error');
  UI.clearFormErrors(['boFStockNum', 'boFQty']);
  const stockNum = val('boFStockNum');
  const qty = parseInt(val('boFQty')) || 0;
  if (!stockNum) { UI.setFieldError('boFStockNum', 'Select or enter a stock number'); return toast('Select or enter a Stock Number', 'error'); }
  if (qty < 1) { UI.setFieldError('boFQty', 'Enter a valid quantity'); return toast('Enter a valid quantity', 'error'); }
  updateTxSteps('bo', 3);

  const btn = document.getElementById('boSubmitBtn');
  UI.withButtonLoading(btn, 'Booking out…', async () => {
  let item = txSelectedIds.bookout ? DB.stock.find(s => s.id === txSelectedIds.bookout) : null;
  if (!item) item = DB.stock.find(s => s.stockNumber === stockNum);
  if (!item) { toast('Stock item not found in register', 'error'); throw new Error('not found'); }
  if (item.quantity < qty) { toast(`Insufficient stock — only ${item.quantity} available`, 'error'); throw new Error('insufficient'); }

  const qtyBefore = item.quantity;
  item.quantity -= qty;

  const tx = {
    id: uid(), type: 'Book Out',
    stockItemId: item.id, stockNumber: item.stockNumber,
    partNumber: item.partNumber, partDescription: item.partDescription,
    quantity: qty, qtyBefore, qtyAfter: item.quantity,
    storageLocation: item.storageLocation,
    jobNumber: val('boFJobNum'), jobCategory: val('boFJobCat'),
    userName: currentUser.firstName + ' ' + currentUser.lastName,
    timestamp: new Date().toISOString()
  };

  if (isApiMode()) {
    await persistStockItem(item, false);
    await persistTransaction(tx);
    DB.transactions.unshift(tx);
    DB.cacheLocal();
  } else {
    DB.transactions.unshift(tx);
    DB.save();
  }

  DB.logActivity(currentUser.firstName + ' ' + currentUser.lastName, 'Book Out', 'Inventory Transactions',
    `Booked out ${qty} x ${item.stockNumber} (bal: ${qtyBefore} → ${item.quantity})`, item.stockNumber, qty);
  UI.showTxSuccess('boSuccessBanner', `<strong>${UI.esc(item.stockNumber)}</strong> · Remaining <strong>${item.quantity}</strong>`);

  txStatusBar('boStatusBar', item, 'bookout');
  setVal('boFQty', '');
  updateTxSteps('bo', 1);
  renderBookOutList();
  }).catch(err => { if (!['not found', 'insufficient'].includes(err.message)) toast(err.message, 'error'); });
}

// ---- RELOCATION ----
function renderRelocationList() {
  const q = val('relSearch').toLowerCase();
  const items = DB.stock.filter(s =>
    s.quantity > 0 && (!q || s.stockNumber.toLowerCase().includes(q) || s.partDescription.toLowerCase().includes(q))
  );
  const countEl = document.getElementById('relCount');
  if (countEl) countEl.textContent = items.length + ' records';
  const list = document.getElementById('relList');
  if (!list) return;
  list.innerHTML = items.length ? items.map(s => `
    <div class="list-item ${txSelectedIds.relocation === s.id ? 'selected' : ''}" onclick="relSelectStock('${s.id}')">
      <div class="list-item-info">
        <div class="list-item-primary">${s.stockNumber}</div>
        <div class="list-item-secondary">${s.partDescription} · ${s.storageLocation || '—'} · Qty ${s.quantity}</div>
      </div>
    </div>
  `).join('') : emptyState('store', 'No inventory available to relocate');
}

function relSelectStock(id) {
  const s = DB.stock.find(x => x.id === id);
  if (!s) return;
  txSelectedIds.relocation = id;
  setVal('relFStockNum', s.stockNumber);
  setVal('relFPartDesc', s.partDescription);
  setVal('relFFromLoc', s.storageLocation);
  setVal('relFFromBin', s.trayBin);
  txStatusBar('relStatusBar', s, 'bookin');
  renderRelocationList();
}

function relLookupStock() {
  const num = val('relFStockNum').trim();
  if (!num) { txSelectedIds.relocation = null; txStatusBar('relStatusBar', null); renderRelocationList(); return; }
  const s = DB.stock.find(x => x.stockNumber === num && x.quantity > 0);
  if (s) {
    txSelectedIds.relocation = s.id;
    setVal('relFPartDesc', s.partDescription);
    setVal('relFFromLoc', s.storageLocation);
    setVal('relFFromBin', s.trayBin);
    txStatusBar('relStatusBar', s, 'bookin');
  } else {
    txSelectedIds.relocation = null;
    txStatusBar('relStatusBar', null);
    toast('Inventory item not found or has zero quantity', 'error');
  }
  renderRelocationList();
}

async function submitRelocation() {
  if (!ManageITPerms.canEdit('StockTransfer')) return toast('You do not have permission to relocate inventory.', 'error');
  const toLoc = val('relFToLoc');
  const qty = parseInt(val('relFQty')) || 0;
  if (!toLoc) return toast('Select a destination location', 'error');
  if (qty < 1) return toast('Enter a valid quantity', 'error');
  let item = txSelectedIds.relocation ? DB.stock.find(s => s.id === txSelectedIds.relocation) : null;
  if (!item) item = DB.stock.find(s => s.stockNumber === val('relFStockNum').trim() && s.quantity > 0);
  if (!item) return toast('Inventory item not found', 'error');
  if (item.quantity < qty) return toast(`Insufficient quantity — only ${item.quantity} available`, 'error');

  const fromLoc = item.storageLocation;
  const fromBin = item.trayBin;
  item.storageLocation = toLoc;
  if (val('relFToBin')) item.trayBin = val('relFToBin');

  const tx = {
    id: uid(), type: 'Relocation',
    stockItemId: item.id, stockNumber: item.stockNumber,
    partDescription: item.partDescription, quantity: qty,
    qtyBefore: item.quantity, qtyAfter: item.quantity,
    storageLocation: toLoc, jobNumber: item.jobNumber || '—',
    transferFrom: `${fromLoc || '—'}${fromBin ? ' / ' + fromBin : ''}`,
    comment: txCommentValue('relFComment'),
    userName: currentUser.firstName + ' ' + currentUser.lastName,
    timestamp: new Date().toISOString()
  };

  if (isApiMode()) {
    await persistStockItem(item, false);
    await persistTransaction(tx);
    DB.transactions.unshift(tx);
    DB.cacheLocal();
  } else {
    DB.transactions.unshift(tx);
    DB.save();
  }
  DB.logActivity(currentUser.firstName + ' ' + currentUser.lastName, 'Relocation', 'Inventory Transactions',
    `Relocated ${qty} x ${item.stockNumber} to ${toLoc}`, item.stockNumber, qty);
  toast(`Relocated to ${toLoc}`, 'success');
  setVal('relFQty', ''); setVal('relFToBin', ''); setVal('relFComment', '');
  renderRelocationList();
}

// ---- TRANSFER ----
function renderTransferList() {
  const q = val('trSearch').toLowerCase();
  const items = DB.stock.filter(s =>
    s.quantity > 0 &&
    (!q || s.stockNumber.toLowerCase().includes(q) || s.partDescription.toLowerCase().includes(q))
  );
  document.getElementById('trCount').textContent = items.length + ' records';
  document.getElementById('trList').innerHTML = items.length ? items.map(s => `
    <div class="list-item ${txSelectedIds.transfer === s.id ? 'selected' : ''}" onclick="trSelectStock('${s.id}')">
      <div class="list-item-avatar" style="font-size:11px">${s.stockNumber.slice(-4)}</div>
      <div class="list-item-info">
        <div class="list-item-primary">${s.stockNumber}${s.jobNumber ? ` <span style="color:var(--blue);font-size:11px">[${s.jobNumber}]</span>` : ''}</div>
        <div class="list-item-secondary">${s.partDescription} — Avail: <strong>${s.quantity}</strong></div>
      </div>
    </div>
  `).join('') : emptyState('package', 'No stock with qty &gt; 0');
}

function trSelectStock(id) {
  const s = DB.stock.find(x => x.id === id);
  if (!s) return;
  txSelectedIds.transfer = id;
  setVal('trFSource', s.stockNumber);
  setVal('trFPartNum', s.partNumber);
  setVal('trFPartDesc', s.partDescription);
  setVal('trFSerial', s.serialNumber);
  refreshSerialSelect('trFSerial', s.serialNumber);
  setVal('trFJobCat', s.jobCategory);
  txStatusBar('trStatusBar', s, 'bookout');
  renderTransferList();
}

function trLookupStock() {
  const num = val('trFSource').trim();
  if (!num) { txSelectedIds.transfer = null; txStatusBar('trStatusBar', null); renderTransferList(); return; }
  const s = DB.stock.find(x => x.stockNumber === num && x.quantity > 0);
  if (s) {
    txSelectedIds.transfer = s.id;
    setVal('trFPartNum', s.partNumber);
    setVal('trFPartDesc', s.partDescription);
    setVal('trFSerial', s.serialNumber);
    refreshSerialSelect('trFSerial', s.serialNumber);
    setVal('trFJobCat', s.jobCategory);
    txStatusBar('trStatusBar', s, 'bookout');
  } else {
    txSelectedIds.transfer = null;
    const el = document.getElementById('trStatusBar');
    el.style.display = 'block';
    el.style.background = '#fdf0ef';
    el.style.borderColor = 'var(--danger)';
    el.innerHTML = `<span class="icon-inline" style="color:var(--danger)">${icon('x', 16, '')}<span>Stock number "<strong>${num}</strong>" not found or has zero quantity.</span></span>`;
  }
  renderTransferList();
}

function setTransferMode(mode) {
  transferMode = mode;
  document.getElementById('trModeGeneral')?.classList.toggle('active', mode === 'general');
  document.getElementById('trModeJobJob')?.classList.toggle('active', mode === 'jobtojob');
  updateTransferModeLabel();
}

function toggleTransferReverse() {
  transferReverse = !!document.getElementById('trReverseToggle')?.checked;
  updateTransferModeLabel();
}

function updateTransferModeLabel() {
  const el = document.getElementById('trModeLabel');
  if (!el) return;
  if (transferReverse) {
    el.textContent = transferMode === 'jobtojob' ? 'Reverse: Job → Job (return)' : 'Reverse: Job → Inventory';
  } else if (transferMode === 'jobtojob') {
    el.textContent = 'Job → Job allocation';
  } else {
    el.textContent = 'Inventory → Job allocation';
  }
}

async function submitTransfer() {
  if (transferReverse) return submitReverseTransfer();
  if (!ManageITPerms.canEdit('StockTransfer')) return toast('You do not have permission to transfer stock.', 'error');
  const comment = requireTransferComment();
  if (!comment) return;
  const destJob = val('trFDestJob').trim();
  const qty = parseInt(val('trFQty')) || 0;
  if (qty < 1) return toast('Enter a valid quantity to transfer', 'error');
  if (!destJob) return toast('Enter a destination job number', 'error');

  // Get source item by bound ID first, fallback to stock number
  let srcItem = txSelectedIds.transfer ? DB.stock.find(s => s.id === txSelectedIds.transfer) : null;
  if (!srcItem) srcItem = DB.stock.find(s => s.stockNumber === val('trFSource').trim() && s.quantity > 0);
  if (!srcItem) return toast('Source stock item not found or has no stock', 'error');
  if (srcItem.quantity < qty) return toast(`Insufficient stock — only ${srcItem.quantity} available`, 'error');

  const srcQtyBefore = srcItem.quantity;
  srcItem.quantity -= qty;

  // Find or create destination:
  // Match: same stockNumber + same jobNumber, OR same partNumber + same jobNumber
  let destItem = DB.stock.find(s =>
    s.id !== srcItem.id &&
    s.stockNumber === srcItem.stockNumber &&
    s.jobNumber === destJob
  ) || DB.stock.find(s =>
    s.id !== srcItem.id &&
    s.partNumber === srcItem.partNumber && s.partNumber &&
    s.jobNumber === destJob
  );

  const destQtyBefore = destItem ? destItem.quantity : 0;
  let destIsNew = false;

  if (destItem) {
    destItem.quantity += qty;
  } else {
    destIsNew = true;
    // Create allocated stock entry at destination job
    destItem = {
      id: uid(),
      stockNumber: srcItem.stockNumber,
      partNumber: srcItem.partNumber,
      partDescription: srcItem.partDescription,
      serialNumber: srcItem.serialNumber,
      quantity: qty,
      stockCategory: normaliseStockCategory(srcItem.stockCategory) || 'Production Inventory',
      storageLocation: srcItem.storageLocation,
      trayBin: srcItem.trayBin,
      poNumber: srcItem.poNumber,
      jobNumber: destJob,
      jobCategory: val('trFJobCat') || srcItem.jobCategory,
      createdAt: new Date().toISOString()
    };
    DB.stock.push(destItem);
  }

  const txRef = uid();
  const txOut = {
    id: uid(), linkedRef: txRef, type: 'Transfer OUT',
    stockItemId: srcItem.id, stockNumber: srcItem.stockNumber,
    partNumber: srcItem.partNumber, partDescription: srcItem.partDescription,
    quantity: qty, qtyBefore: srcQtyBefore, qtyAfter: srcItem.quantity,
    storageLocation: srcItem.storageLocation, jobNumber: srcItem.jobNumber || '—',
    transferTo: destJob, comment,
    userName: currentUser.firstName + ' ' + currentUser.lastName,
    timestamp: new Date().toISOString()
  };
  const txIn = {
    id: uid(), linkedRef: txRef, type: 'Transfer IN',
    stockItemId: destItem.id, stockNumber: destItem.stockNumber,
    partNumber: destItem.partNumber, partDescription: destItem.partDescription,
    quantity: qty, qtyBefore: destQtyBefore, qtyAfter: destItem.quantity,
    storageLocation: destItem.storageLocation, jobNumber: destJob,
    transferFrom: srcItem.jobNumber || srcItem.stockNumber, comment,
    userName: currentUser.firstName + ' ' + currentUser.lastName,
    timestamp: new Date().toISOString()
  };

  if (isApiMode()) {
    await persistStockItem(srcItem, false);
    await persistStockItem(destItem, destIsNew);
    await persistTransaction(txOut);
    await persistTransaction(txIn);
    DB.transactions.unshift(txIn, txOut);
    DB.cacheLocal();
  } else {
    DB.transactions.unshift(txOut, txIn);
    DB.save();
  }

  DB.logActivity(currentUser.firstName + ' ' + currentUser.lastName, 'Transfer', 'Inventory Transactions',
    `Transferred ${qty} x ${srcItem.stockNumber} → job ${destJob} (src bal: ${srcQtyBefore}→${srcItem.quantity})`,
    srcItem.stockNumber, qty);
  toast(`Transferred ${qty} x ${srcItem.stockNumber} to job ${destJob}`, 'success');

  txStatusBar('trStatusBar', srcItem, 'bookout');
  setVal('trFQty', ''); setVal('trFComment', '');
  renderTransferList();
}

async function submitReverseTransfer() {
  if (!ManageITPerms.canEdit('StockTransfer')) return toast('You do not have permission to transfer inventory.', 'error');
  const comment = requireTransferComment();
  if (!comment) return;
  const qty = parseInt(val('trFQty')) || 0;
  if (qty < 1) return toast('Enter a valid quantity to transfer', 'error');

  let srcItem = txSelectedIds.transfer ? DB.stock.find(s => s.id === txSelectedIds.transfer) : null;
  if (!srcItem) srcItem = DB.stock.find(s => s.stockNumber === val('trFSource').trim() && s.quantity > 0);
  if (!srcItem) return toast('Source inventory item not found', 'error');
  if (!srcItem.jobNumber && transferMode === 'general') return toast('Reverse transfer requires job-allocated source inventory', 'error');
  if (srcItem.quantity < qty) return toast(`Insufficient quantity — only ${srcItem.quantity} available`, 'error');

  const srcQtyBefore = srcItem.quantity;
  srcItem.quantity -= qty;

  let destItem;
  if (transferMode === 'jobtojob') {
    const destJob = val('trFDestJob').trim();
    if (!destJob) return toast('Enter a destination job number', 'error');
    destItem = DB.stock.find(s => s.id !== srcItem.id && s.stockNumber === srcItem.stockNumber && s.jobNumber === destJob);
    if (destItem) destItem.quantity += qty;
    else {
      destItem = { ...srcItem, id: uid(), quantity: qty, jobNumber: destJob, createdAt: new Date().toISOString() };
      DB.stock.push(destItem);
    }
  } else {
    destItem = DB.stock.find(s =>
      s.id !== srcItem.id && s.stockNumber === srcItem.stockNumber &&
      (!s.jobNumber || s.jobNumber === '') && isActiveStockCategory(s.stockCategory)
    );
    if (destItem) {
      destItem.quantity += qty;
    } else {
      destItem = {
        id: uid(), stockNumber: srcItem.stockNumber, partNumber: srcItem.partNumber,
        partDescription: srcItem.partDescription, serialNumber: srcItem.serialNumber,
        quantity: qty, stockCategory: normaliseStockCategory(srcItem.stockCategory) || 'Production Inventory',
        storageLocation: srcItem.storageLocation, trayBin: srcItem.trayBin,
        poNumber: srcItem.poNumber, jobNumber: '', jobCategory: '',
        createdAt: new Date().toISOString()
      };
      DB.stock.push(destItem);
    }
  }

  const tx = {
    id: uid(), type: 'Transfer (Reverse)',
    stockItemId: srcItem.id, stockNumber: srcItem.stockNumber,
    partDescription: srcItem.partDescription, quantity: qty,
    qtyBefore: srcQtyBefore, qtyAfter: srcItem.quantity,
    storageLocation: destItem.storageLocation, jobNumber: destItem.jobNumber || '—',
    transferFrom: srcItem.jobNumber || srcItem.stockNumber, comment,
    userName: currentUser.firstName + ' ' + currentUser.lastName,
    timestamp: new Date().toISOString()
  };

  if (isApiMode()) {
    await persistStockItem(srcItem, false);
    await persistStockItem(destItem, false);
    await persistTransaction(tx);
    DB.transactions.unshift(tx);
    DB.cacheLocal();
  } else {
    DB.transactions.unshift(tx);
    DB.save();
  }
  DB.logActivity(currentUser.firstName + ' ' + currentUser.lastName, 'Transfer (Reverse)', 'Inventory Transactions',
    `Returned ${qty} x ${srcItem.stockNumber} from job to inventory`, srcItem.stockNumber, qty);
  toast(`Reverse transfer complete — ${qty} x ${srcItem.stockNumber}`, 'success');
  setVal('trFQty', ''); setVal('trFComment', '');
  renderTransferList();
}

// ---- ADJUSTMENT ----
function renderAdjustmentList() {
  const q = val('adjSearch').toLowerCase();
  const items = DB.stock.filter(s =>
    !q || s.stockNumber.toLowerCase().includes(q) || s.partDescription.toLowerCase().includes(q)
  );
  const countEl = document.getElementById('adjCount');
  if (countEl) countEl.textContent = items.length + ' records';
  const list = document.getElementById('adjList');
  if (!list) return;
  list.innerHTML = items.length ? items.map(s => `
    <div class="list-item ${txSelectedIds.adjustment === s.id ? 'selected' : ''}" onclick="adjSelectStock('${s.id}')">
      <div class="list-item-info">
        <div class="list-item-primary">${s.stockNumber}</div>
        <div class="list-item-secondary">${s.partDescription} · Qty ${s.quantity}</div>
      </div>
    </div>
  `).join('') : emptyState('edit', 'No inventory items found');
}

function adjSelectStock(id) {
  const s = DB.stock.find(x => x.id === id);
  if (!s) return;
  txSelectedIds.adjustment = id;
  setVal('adjFStockNum', s.stockNumber);
  setVal('adjFPartDesc', s.partDescription);
  setVal('adjFCurrentQty', String(s.quantity));
  setVal('adjFNewQty', String(s.quantity));
  updateAdjustmentPreview();
  txStatusBar('adjStatusBar', s, 'bookin');
  renderAdjustmentList();
}

function adjLookupStock() {
  const num = val('adjFStockNum').trim();
  if (!num) {
    txSelectedIds.adjustment = null;
    txStatusBar('adjStatusBar', null);
    setVal('adjFPartDesc', ''); setVal('adjFCurrentQty', ''); setVal('adjFNewQty', ''); setVal('adjFVariance', '');
    renderAdjustmentList();
    return;
  }
  const s = DB.stock.find(x => x.stockNumber === num);
  if (s) {
    txSelectedIds.adjustment = s.id;
    setVal('adjFPartDesc', s.partDescription);
    setVal('adjFCurrentQty', String(s.quantity));
    setVal('adjFNewQty', String(s.quantity));
    updateAdjustmentPreview();
    txStatusBar('adjStatusBar', s, 'bookin');
  } else {
    txSelectedIds.adjustment = null;
    txStatusBar('adjStatusBar', null);
    toast('Inventory item not found', 'error');
  }
  renderAdjustmentList();
}

function updateAdjustmentPreview() {
  const current = parseInt(val('adjFCurrentQty')) || 0;
  const next = val('adjFNewQty') === '' ? null : parseInt(val('adjFNewQty'));
  if (next == null || Number.isNaN(next)) {
    setVal('adjFVariance', '—');
    return;
  }
  const diff = next - current;
  setVal('adjFVariance', diff === 0 ? 'No change' : `${diff > 0 ? '+' : ''}${diff}`);
}

async function submitAdjustment() {
  if (!ManageITPerms.canView('StockAdjustments')) return toast('You do not have permission for inventory adjustments.', 'error');
  UI.clearFormErrors(['adjFStockNum', 'adjFNewQty']);
  const stockNum = val('adjFStockNum').trim();
  const newQty = parseInt(val('adjFNewQty'));
  if (!stockNum) { UI.setFieldError('adjFStockNum', 'Select or enter an inventory number'); return toast('Enter an inventory number', 'error'); }
  if (Number.isNaN(newQty) || newQty < 0) { UI.setFieldError('adjFNewQty', 'Enter a valid quantity'); return toast('Enter a valid new quantity', 'error'); }

  let item = txSelectedIds.adjustment ? DB.stock.find(s => s.id === txSelectedIds.adjustment) : null;
  if (!item) item = DB.stock.find(s => s.stockNumber === stockNum);
  if (!item) return toast('Inventory item not found', 'error');

  const qtyBefore = item.quantity;
  const diff = newQty - qtyBefore;
  if (diff === 0) return toast('New quantity matches current quantity — no adjustment needed', 'warning');

  const comment = txCommentValue('adjFComment');
  const description = comment || `Inventory adjustment ${item.stockNumber}: ${diff > 0 ? '+' : ''}${diff}`;

  if (ManageITPerms.isRequestOnly('StockAdjustments')) {
    submitPendingApproval({
      type: 'Adjustment',
      stockNumber: item.stockNumber,
      description,
      quantityChange: diff,
      payload: { stockId: item.id, physicalQty: newQty, stockNumber: item.stockNumber, comment }
    });
    setVal('adjFComment', '');
    return;
  }
  if (!ManageITPerms.canEdit('StockAdjustments') && !ManageITPerms.canFull('StockAdjustments')) {
    return toast('You cannot apply adjustments directly.', 'error');
  }

  item.quantity = newQty;
  const tx = {
    id: uid(), type: 'Adjustment',
    stockItemId: item.id, stockNumber: item.stockNumber,
    partDescription: item.partDescription, quantity: Math.abs(diff),
    qtyBefore, qtyAfter: newQty,
    storageLocation: item.storageLocation, comment,
    userName: currentUser.firstName + ' ' + currentUser.lastName,
    timestamp: new Date().toISOString()
  };

  if (isApiMode()) {
    await persistStockItem(item, false);
    await persistTransaction(tx);
    DB.transactions.unshift(tx);
    DB.cacheLocal();
  } else {
    DB.transactions.unshift(tx);
    DB.save();
  }

  DB.logActivity(currentUser.firstName + ' ' + currentUser.lastName, 'Adjustment', 'Inventory Transactions',
    `Adjusted ${item.stockNumber} by ${diff > 0 ? '+' : ''}${diff} (${qtyBefore} → ${newQty})`, item.stockNumber, diff);
  toast(`Adjusted ${item.stockNumber} (${diff > 0 ? '+' : ''}${diff})`, 'success');
  setVal('adjFCurrentQty', String(newQty));
  setVal('adjFNewQty', String(newQty));
  setVal('adjFVariance', 'No change');
  setVal('adjFComment', '');
  txStatusBar('adjStatusBar', item, 'bookin');
  renderAdjustmentList();
}

function renderTxHistory() {
  const q = val('txHistSearch').toLowerCase();
  const tf = val('txHistTypeFilter');
  const items = DB.transactions.filter(t =>
    (!q || t.stockNumber?.toLowerCase().includes(q) || t.userName?.toLowerCase().includes(q) || t.jobNumber?.toLowerCase().includes(q) || t.comment?.toLowerCase().includes(q)) &&
    (!tf || t.type === tf || t.type.startsWith(tf) || (tf === 'Receipt' && t.type === 'Book In') || (tf === 'Transfer' && t.type.startsWith('Transfer')) || (tf === 'Adjustment' && t.type === 'Adjustment'))
  );
  const body = document.getElementById('txHistoryBody');
  if (!items.length) {
    body.innerHTML = '<tr class="table-empty"><td colspan="12">No transactions found</td></tr>';
    return;
  }
  const displayType = t => t.type === 'Book In' ? 'Receipt' : invLabel(t.type);
  const typeColor = t => ({
    'Receipt': 'badge-active', 'Book In': 'badge-active', 'Book Out': 'badge-inactive',
    'Relocation': 'badge-user', 'Transfer IN': 'badge-user', 'Transfer OUT': 'badge-inactive',
    'Transfer (Reverse)': 'badge-user', Transfer: 'badge-user', Adjustment: 'badge-user'
  }[t] || 'badge-user');
  body.innerHTML = items.map(t => `
    <tr>
      <td style="white-space:nowrap">${fmtDateTime(t.timestamp)}</td>
      <td><span class="list-item-badge ${typeColor(t.type)}">${displayType(t.type)}</span></td>
      <td><strong>${t.stockNumber || '—'}</strong></td>
      <td>${t.partDescription || '—'}</td>
      <td><strong style="color:${txQtyColor(t)}">${txQtyDisplay(t)}</strong></td>
      <td style="color:var(--text-muted)">${t.qtyBefore ?? '—'}</td>
      <td><strong>${t.qtyAfter ?? '—'}</strong></td>
      <td>${t.storageLocation || '—'}</td>
      <td>${t.jobNumber || '—'}</td>
      <td style="max-width:180px;white-space:normal">${UI.esc(t.comment || '—')}</td>
      <td>${t.userName}</td>
      <td>${t.stockItemId ? `<button class="btn btn-outline btn-sm" onclick="viewStockRegister('${t.stockItemId}')" title="Register">${icon('history', 14, '')}</button>` : ''}</td>
    </tr>
  `).join('');
}

// ============================================
// PENDING APPROVALS (Request → Approve workflow)
// ============================================
function submitPendingApproval(entry) {
  if (!DB.pendingApprovals) DB.pendingApprovals = [];
  const item = {
    id: uid(),
    type: entry.type,
    status: 'Pending',
    stockNumber: entry.stockNumber || '',
    description: entry.description || '',
    quantityChange: entry.quantityChange || 0,
    requestedBy: currentUser.firstName + ' ' + currentUser.lastName,
    requestedAt: new Date().toISOString(),
    payloadJson: JSON.stringify(entry.payload || {})
  };
  DB.pendingApprovals.unshift(item);
  DB.logActivity(currentUser.firstName + ' ' + currentUser.lastName, 'Request Approval', entry.type,
    item.description, item.stockNumber, item.quantityChange);
  DB.save();
  toast('Submitted for approval', 'success');
  renderApprovalsTable();
}

function renderApprovalsTable() {
  const body = document.getElementById('approvalsTableBody');
  if (!body) return;
  const pending = (DB.pendingApprovals || []).filter(p => p.status === 'Pending');
  document.getElementById('approvalsPendingCount').textContent = pending.length;
  if (!pending.length) {
    body.innerHTML = '<tr class="table-empty"><td colspan="7">No pending approvals</td></tr>';
    return;
  }
  const canAct = ManageITPerms.hasAnyApprovePermission();
  body.innerHTML = pending.map(p => `
    <tr>
      <td>${fmtDateTime(p.requestedAt)}</td>
      <td><span class="list-item-badge badge-user">${UI.esc(p.type)}</span></td>
      <td><strong>${UI.esc(p.stockNumber)}</strong></td>
      <td>${UI.esc(p.description)}</td>
      <td>${p.quantityChange > 0 ? '+' : ''}${p.quantityChange}</td>
      <td>${UI.esc(p.requestedBy)}</td>
      <td>${canAct ? `
        <button class="btn btn-sm btn-primary" onclick="approvePending('${p.id}')">Approve</button>
        <button class="btn btn-sm btn-outline" style="margin-left:4px" onclick="rejectPending('${p.id}')">Reject</button>
      ` : '—'}</td>
    </tr>
  `).join('');
}

function approvePending(id) {
  const permMap = { Adjustment: 'StockAdjustments', StockTake: 'StockTake', AuditAdjustment: 'AuditAdjustments' };
  const p = (DB.pendingApprovals || []).find(x => x.id === id);
  if (!p || p.status !== 'Pending') return;
  const code = permMap[p.type] || 'StockAdjustments';
  if (!ManageITPerms.canApprove(code)) return toast('You cannot approve this item.', 'error');

  let payload = {};
  try { payload = JSON.parse(p.payloadJson || '{}'); } catch (e) {}

  (async () => {
    try {
      if (p.type === 'Adjustment' && payload.stockId) {
        const item = DB.stock.find(s => s.id === payload.stockId);
        if (item) {
          const qtyBefore = item.quantity;
          item.quantity = payload.physicalQty ?? (item.quantity + p.quantityChange);
          const tx = {
            id: uid(), type: 'Adjustment', stockItemId: item.id, stockNumber: item.stockNumber,
            partDescription: item.partDescription, quantity: Math.abs(p.quantityChange),
            qtyBefore, qtyAfter: item.quantity,
            storageLocation: item.storageLocation, comment: payload.comment || p.description || '',
            userName: currentUser.firstName + ' ' + currentUser.lastName,
            timestamp: new Date().toISOString()
          };
          if (isApiMode()) {
            await persistStockItem(item, false);
            await persistTransaction(tx);
            DB.transactions.unshift(tx);
            DB.cacheLocal();
          } else {
            DB.transactions.unshift(tx);
            DB.save();
          }
        }
      }

      p.status = 'Approved';
      p.approvedBy = currentUser.firstName + ' ' + currentUser.lastName;
      p.resolvedAt = new Date().toISOString();
      DB.logActivity(currentUser.firstName + ' ' + currentUser.lastName, 'Approve', 'Approvals', `Approved ${p.type} for ${p.stockNumber}`, p.stockNumber);
      if (!isApiMode()) DB.save();
      else DB.cacheLocal();
      toast('Approved', 'success');
      renderApprovalsTable();
    } catch (err) {
      toast(err.message || 'Failed to approve', 'error');
    }
  })();
}

function rejectPending(id) {
  const p = (DB.pendingApprovals || []).find(x => x.id === id);
  if (!p || p.status !== 'Pending') return;
  p.status = 'Rejected';
  p.resolvedAt = new Date().toISOString();
  DB.logActivity(currentUser.firstName + ' ' + currentUser.lastName, 'Reject', 'Approvals', `Rejected ${p.type} for ${p.stockNumber}`, p.stockNumber);
  DB.save();
  toast('Rejected', 'success');
  renderApprovalsTable();
}

function permLevelBadge(level) {
  const map = {
    Full: { cls: 'perm-full', label: 'Full' },
    View: { cls: 'perm-view', label: 'View' },
    CreateEdit: { cls: 'perm-edit', label: 'Edit' },
    Approve: { cls: 'perm-approve', label: 'Approve' },
    Request: { cls: 'perm-request', label: 'Request' },
    None: { cls: 'perm-none', label: 'None' }
  };
  const m = map[level] || { cls: 'perm-none', label: level || 'None' };
  return `<span class="perm-badge ${m.cls}">${m.label}</span>`;
}

function renderRoleMatrix() {
  const body = document.getElementById('roleMatrixBody');
  if (!body) return;
  const roles = ['admin', 'stockCapturer', 'approver', 'storeManager', 'auditor', 'viewer'];
  const labels = roles.map(r => ManageITPerms.ROLE_LABELS[r]);
  const functions = Object.keys(ManageITPerms.MATRIX.admin);

  body.innerHTML = functions.map(fn => {
    const display = fn.replace(/([A-Z])/g, ' $1').trim();
    const cells = roles.map(r => {
      const l = ManageITPerms.MATRIX[r][fn] || 'None';
      return `<td title="${l}">${permLevelBadge(l)}</td>`;
    }).join('');
    return `<tr><td><strong>${display}</strong></td>${cells}</tr>`;
  }).join('');

  const head = document.getElementById('roleMatrixHead');
  if (head) head.innerHTML = `<tr><th>Function</th>${labels.map(l => `<th>${l}</th>`).join('')}</tr>`;
}

// ============================================
// RECONCILIATION
// ============================================
function runReconciliation() {
  reconcileData = DB.stock.map(s => ({
    ...s,
    physicalQty: s.quantity, // In a real app this would come from physical count input
    diff: 0
  }));
  renderReconcileTable();
}

function renderReconcileTable() {
  const q = val('reconcileSearch').toLowerCase();
  const items = reconcileData.filter(s => !q || s.stockNumber.toLowerCase().includes(q) || s.partDescription.toLowerCase().includes(q));
  const body = document.getElementById('reconcileTableBody');
  if (!items.length) {
    body.innerHTML = '<tr class="table-empty"><td colspan="8">No data — click Run Reconciliation</td></tr>';
    return;
  }
  body.innerHTML = items.map((s, i) => {
    const diff = s.physicalQty - s.quantity;
    const diffClass = diff > 0 ? 'positive' : diff < 0 ? 'negative' : 'zero';
    return `
      <tr>
        <td><strong>${s.stockNumber}</strong></td>
        <td>${s.partDescription}</td>
        <td><span class="stock-badge ${stockCategoryClass(s.stockCategory)}">${UI.esc(normaliseStockCategory(s.stockCategory) || s.stockCategory || '—')}</span></td>
        <td>${s.quantity}</td>
        <td><input type="number" class="form-input" style="width:80px;padding:4px 8px" value="${s.physicalQty}" min="0" onchange="updatePhysicalQty(${i},this.value)" /></td>
        <td class="reconcile-diff ${diffClass}">${diff > 0 ? '+' : ''}${diff}</td>
        <td>${diff === 0 ? statusBadge('match', 'Match') : diff > 0 ? statusBadge('surplus', 'Surplus') : statusBadge('shortage', 'Shortage')}</td>
        <td>${diff !== 0 ? `<button class="btn btn-sm btn-primary" onclick="applyReconcile(${i})">Apply</button>` : '—'}</td>
      </tr>
    `;
  }).join('');
}

function updatePhysicalQty(idx, newVal) {
  if (reconcileData[idx]) reconcileData[idx].physicalQty = parseInt(newVal) || 0;
  renderReconcileTable();
}

function applyReconcile(idx) {
  if (!ManageITPerms.canView('StockAdjustments')) return toast('You do not have permission for stock adjustments.', 'error');
  const r = reconcileData[idx];
  if (!r) return;
  const item = DB.stock.find(s => s.id === r.id);
  if (!item) return;
  const diff = r.physicalQty - item.quantity;
  if (ManageITPerms.isRequestOnly('StockAdjustments')) {
    submitPendingApproval({
      type: 'Adjustment',
      stockNumber: r.stockNumber,
      description: `Stock adjustment ${r.stockNumber}: ${diff > 0 ? '+' : ''}${diff}`,
      quantityChange: diff,
      payload: { stockId: r.id, physicalQty: r.physicalQty, stockNumber: r.stockNumber }
    });
    return;
  }
  if (!ManageITPerms.canEdit('StockAdjustments') && !ManageITPerms.canFull('StockAdjustments')) {
    return toast('You cannot apply adjustments directly.', 'error');
  }
  const systemQty = item.quantity;
  item.quantity = r.physicalQty;
  r.quantity = r.physicalQty;

  const tx = {
    id: uid(), type: 'Adjustment', stockItemId: item.id, stockNumber: item.stockNumber,
    partDescription: item.partDescription, quantity: Math.abs(diff),
    qtyBefore: systemQty, qtyAfter: item.quantity,
    storageLocation: item.storageLocation,
    userName: currentUser.firstName + ' ' + currentUser.lastName,
    timestamp: new Date().toISOString()
  };
  const recon = {
    stockNumber: r.stockNumber,
    partDescription: r.partDescription,
    systemQty,
    physicalQty: r.physicalQty,
    variance: diff,
    status: 'Reconciled',
    reconciledAt: new Date().toISOString()
  };

  (async () => {
    try {
      if (isApiMode()) {
        await persistStockItem(item, false);
        await persistTransaction(tx);
        const savedRecon = await ManageITApi.createReconciliation(recon);
        DB.transactions.unshift(tx);
        if (!DB.reconciliations) DB.reconciliations = [];
        DB.reconciliations.unshift(savedRecon);
        DB.cacheLocal();
      } else {
        DB.transactions.unshift(tx);
        if (!DB.reconciliations) DB.reconciliations = [];
        DB.reconciliations.unshift({ id: uid(), ...recon });
        DB.save();
      }
      DB.logActivity(currentUser.firstName + ' ' + currentUser.lastName, 'Reconcile', 'Stock Reconciliation', `Adjusted ${r.stockNumber} by ${diff > 0 ? '+' : ''}${diff}`, r.stockNumber, diff);
      toast(`Reconciled ${r.stockNumber} (adjusted ${diff > 0 ? '+' : ''}${diff})`, 'success');
      renderReconcileTable();
    } catch (err) {
      item.quantity = systemQty;
      r.quantity = systemQty;
      toast(err.message || 'Failed to reconcile', 'error');
    }
  })();
}

// ============================================
// STOCK REGISTER (per-item transaction history)
// ============================================
let registerStockId = null;

function viewStockRegister(stockId) {
  const item = DB.stock.find(s => s.id === stockId);
  if (!item) return toast('Stock item not found', 'error');
  registerStockId = stockId;

  document.getElementById('regModalTitle').textContent = `Stock Register — ${item.stockNumber}`;
  document.getElementById('regModalSub').textContent =
    `${item.partDescription}  ·  ${item.stockCategory}  ·  ${item.storageLocation || 'No location'}`;

  // Summary strip
  const txForItem = DB.transactions.filter(t => t.stockItemId === stockId);
  const totalIn  = txForItem.filter(t => t.type === 'Book In' || t.type === 'Transfer IN').reduce((s,t) => s + t.quantity, 0);
  const totalOut = txForItem.filter(t => t.type === 'Book Out' || t.type === 'Transfer OUT').reduce((s,t) => s + t.quantity, 0);
  const low = DB.settings.lowStockThreshold || 5;

  document.getElementById('regSummaryStrip').innerHTML = [
    { label: 'Current Balance', value: item.quantity, color: item.quantity < low ? 'var(--danger)' : '#27ae60' },
    { label: 'Total Booked In', value: totalIn, color: '#27ae60' },
    { label: 'Total Booked Out', value: totalOut, color: 'var(--danger)' },
    { label: 'Transactions', value: txForItem.length, color: 'var(--navy)' },
  ].map(s => `
    <div style="flex:1;text-align:center;padding:14px 10px;border-right:1px solid var(--border)">
      <div style="font-size:22px;font-weight:800;color:${s.color}">${s.value}</div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${s.label}</div>
    </div>
  `).join('');

  renderRegisterTable(stockId, txForItem);
  document.getElementById('stockRegisterModal').classList.add('open');
}

function renderRegisterTable(stockId, txList) {
  const body = document.getElementById('regTableBody');
  // Sort oldest first for ledger view (running balance makes sense chronologically)
  const sorted = [...(txList || DB.transactions.filter(t => t.stockItemId === stockId))]
    .sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));

  if (!sorted.length) {
    body.innerHTML = '<tr class="table-empty"><td colspan="8">No transactions for this stock item yet</td></tr>';
    return;
  }

  const typeColor = t => ({
    'Book In': 'badge-active', 'Book Out': 'badge-inactive',
    'Transfer IN': 'badge-user', 'Transfer OUT': 'badge-inactive'
  }[t] || 'badge-user');

  body.innerHTML = sorted.map(t => `
    <tr>
      <td style="white-space:nowrap">${fmtDateTime(t.timestamp)}</td>
      <td><span class="list-item-badge ${typeColor(t.type)}">${t.type}</span></td>
      <td><strong style="color:${t.type === 'Book Out' || t.type === 'Transfer OUT' ? 'var(--danger)' : '#27ae60'}">
        ${t.type === 'Book Out' || t.type === 'Transfer OUT' ? '−' : '+'}${t.quantity}
      </strong></td>
      <td><strong>${t.qtyAfter ?? '—'}</strong></td>
      <td>${t.storageLocation || '—'}</td>
      <td>${t.jobNumber || (t.transferTo ? '→ ' + t.transferTo : t.transferFrom ? '← ' + t.transferFrom : '—')}</td>
      <td>${t.poNumber || '—'}</td>
      <td>${t.userName}</td>
    </tr>
  `).join('');
}

function closeRegisterModal() {
  document.getElementById('stockRegisterModal').classList.remove('open');
}

function exportRegisterCSV() {
  if (!registerStockId) return;
  const item = DB.stock.find(s => s.id === registerStockId);
  const rows = DB.transactions
    .filter(t => t.stockItemId === registerStockId)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .map(t => ({
      timestamp: t.timestamp,
      type: t.type === 'Book In' ? 'Receipt' : t.type,
      quantity: t.quantity,
      qtyAfter: t.qtyAfter ?? '',
      storageLocation: t.storageLocation || '',
      jobNumber: t.jobNumber || '',
      poNumber: t.poNumber || '',
      comment: t.comment || '',
      userName: t.userName
    }));

  if (typeof ExcelJS !== 'undefined' && typeof ManageITExcel !== 'undefined') {
    const workbook = new ExcelJS.Workbook();
    ManageITExcel.buildSheet(workbook, {
      sheet: 'Item Register',
      title: `Inventory Register — ${item?.stockNumber || 'Item'}`,
      columns: [
        { header: 'Date / Time', key: 'timestamp', width: 20, format: 'datetime' },
        { header: 'Type', key: 'type', width: 16 },
        { header: 'Quantity', key: 'quantity', width: 12 },
        { header: 'Balance After', key: 'qtyAfter', width: 14 },
        { header: 'Location', key: 'storageLocation', width: 24 },
        { header: 'Job', key: 'jobNumber', width: 14 },
        { header: 'PO Ref', key: 'poNumber', width: 14 },
        { header: 'Comment', key: 'comment', width: 24 },
        { header: 'User', key: 'userName', width: 18 }
      ]
    }, rows);
    ManageITExcel.downloadWorkbook(workbook, `ManageIT_Register_${item?.stockNumber || 'item'}`).then(() => toast('Register exported', 'success'));
    return;
  }

  const csvRows = [['Date/Time','Type','Qty','Balance After','Location','Job/Transfer','PO Ref','Comment','User']];
  rows.forEach(t => csvRows.push([
    fmtDateTime(t.timestamp), t.type, t.quantity, t.qtyAfter,
    t.storageLocation, t.jobNumber, t.poNumber, t.comment, t.userName
  ]));
  const csv = csvRows.map(r => r.map(c => `"${(c||'').toString().replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `register_${item?.stockNumber || 'unknown'}.csv`;
  a.click();
  toast('Register exported', 'success');
}

// ============================================
// AUDIT
// ============================================
function startAudit() {
  if (!ManageITPerms.canEdit('StockTake') && !ManageITPerms.canFull('StockTake')) {
    return toast('You do not have permission to run a stock take.', 'error');
  }
  const items = DB.stock.slice(0, 10);
  (async () => {
    try {
      for (const s of items) {
        const audited = Math.max(0, s.quantity + Math.floor(Math.random() * 3) - 1);
        const audit = {
          auditDate: new Date().toISOString(),
          stockNumber: s.stockNumber,
          partDescription: s.partDescription,
          systemQty: s.quantity,
          auditedQty: audited,
          result: audited === s.quantity ? 'Match' : audited > s.quantity ? 'Surplus' : 'Shortage',
          auditedBy: currentUser.firstName + ' ' + currentUser.lastName
        };
        if (isApiMode()) {
          const saved = await ManageITApi.createAudit(audit);
          DB.audits.unshift(saved);
        } else {
          DB.audits.unshift({ id: uid(), ...audit });
        }
      }
      if (isApiMode()) DB.cacheLocal();
      else DB.save();
      DB.logActivity(currentUser.firstName + ' ' + currentUser.lastName, 'Audit', 'Inventory Audit', `Ran inventory audit on ${items.length} items`);
      renderAuditTable();
      toast(`Audit complete — ${items.length} items audited`, 'success');
    } catch (err) {
      toast(err.message || 'Failed to save audit to SQL', 'error');
    }
  })();
}

function renderAuditTable() {
  const items = DB.audits.slice(0, 50);
  const matched = items.filter(a => a.result === 'Match').length;
  const unmatched = items.filter(a => a.result !== 'Match').length;
  document.getElementById('auditMatched').textContent = matched;
  document.getElementById('auditUnmatched').textContent = unmatched;
  document.getElementById('auditPct').textContent = items.length ? Math.round(matched/items.length*100) + '%' : '—';

  const body = document.getElementById('auditTableBody');
  if (!items.length) {
    body.innerHTML = '<tr class="table-empty"><td colspan="7">No audit records — run an audit first</td></tr>';
    return;
  }
  body.innerHTML = items.map(a => `
    <tr>
      <td>${fmtDateTime(a.auditDate)}</td>
      <td>${a.stockNumber}</td>
      <td>${a.partDescription}</td>
      <td>${a.systemQty}</td>
      <td>${a.auditedQty}</td>
      <td>${a.result === 'Match' ? statusBadge('match', 'Match') : a.result === 'Surplus' ? statusBadge('surplus', 'Surplus') : statusBadge('shortage', 'Shortage')}</td>
      <td>${a.auditedBy}</td>
    </tr>
  `).join('');
}

// ============================================
// STORAGE LOCATIONS
// ============================================
function renderStorageList() {
  const q = val('storageSearch').toLowerCase();
  const items = DB.storageLocations.filter(s => !q || s.name.toLowerCase().includes(q));
  document.getElementById('storageCount').textContent = items.length + ' records';
  const list = document.getElementById('storageList');
  if (!items.length) {
    list.innerHTML = emptyState('store', 'No locations found');
    return;
  }
  list.innerHTML = items.map(s => `
    <div class="list-item ${selectedStorageId === s.id ? 'selected' : ''}" onclick="selectStorage('${s.id}')">
      <div class="list-item-avatar list-item-avatar-icon">${icon('store', 18, '')}</div>
      <div class="list-item-info">
        <div class="list-item-primary">${s.name}</div>
        <div class="list-item-secondary">${s.building || s.type || '—'}</div>
      </div>
    </div>
  `).join('');
}

function selectStorage(id) {
  selectedStorageId = id;
  const s = DB.storageLocations.find(x => x.id === id);
  if (!s) return;
  show(document.getElementById('storageFormContent'));
  hide(document.getElementById('storageFormEmpty'));
  document.getElementById('storageFormTitle').textContent = 'Edit Location';
  document.getElementById('storageFormBadge').textContent = 'EDIT';
  document.getElementById('storageFormBadge').className = 'form-mode-badge edit';
  setVal('fStorageName', s.name);
  setVal('fStorageDesc', s.description);
  setVal('fStorageBuilding', s.building);
  setVal('fStorageType', s.type);
  show(document.getElementById('storageDeleteBtn'));
  renderStorageList();
}

function storageForm() {
  selectedStorageId = null;
  show(document.getElementById('storageFormContent'));
  hide(document.getElementById('storageFormEmpty'));
  document.getElementById('storageFormTitle').textContent = 'Add Location';
  document.getElementById('storageFormBadge').textContent = 'NEW';
  document.getElementById('storageFormBadge').className = 'form-mode-badge add';
  ['fStorageName','fStorageDesc','fStorageBuilding'].forEach(id => setVal(id,''));
  setVal('fStorageType','');
  hide(document.getElementById('storageDeleteBtn'));
  renderStorageList();
}

function storageFormClear() {
  selectedStorageId = null;
  hide(document.getElementById('storageFormContent'));
  show(document.getElementById('storageFormEmpty'));
  renderStorageList();
}

function saveStorage() {
  const name = val('fStorageName');
  if (!name) return toast('Enter a location name', 'error');
  const data = { name, description: val('fStorageDesc'), building: val('fStorageBuilding'), type: val('fStorageType') || 'Other' };

  UI.withButtonLoading(document.getElementById('storageSaveBtn'), 'Saving…', async () => {
    if (isApiMode()) {
      if (selectedStorageId && isServerId(selectedStorageId)) {
        const updated = await ManageITApi.updateStorageLocation(selectedStorageId, data);
        const idx = DB.storageLocations.findIndex(s => s.id === selectedStorageId);
        if (idx >= 0) DB.storageLocations[idx] = updated;
        toast('Location updated', 'success');
      } else {
        const created = await ManageITApi.createStorageLocation(data);
        DB.storageLocations.push(created);
        toast('Location added', 'success');
      }
      DB.cacheLocal();
    } else if (selectedStorageId) {
      const idx = DB.storageLocations.findIndex(s => s.id === selectedStorageId);
      DB.storageLocations[idx] = { ...DB.storageLocations[idx], ...data };
      DB.save();
      toast('Location updated', 'success');
    } else {
      DB.storageLocations.push({ id: uid(), ...data });
      DB.save();
      toast('Location added', 'success');
    }
    refreshStorageSelects();
    renderStorageList();
  }).catch(err => toast(err.message || 'Failed to save location', 'error'));
}

function deleteStorageConfirm() {
  const s = DB.storageLocations.find(x => x.id === selectedStorageId);
  if (!s) return;
  confirm('Delete Location', `Delete "${s.name}"?`, 'Delete', 'btn-danger', async () => {
    if (isApiMode() && isServerId(selectedStorageId)) {
      try {
        await ManageITApi.deleteStorageLocation(selectedStorageId);
        DB.storageLocations = DB.storageLocations.filter(x => x.id !== selectedStorageId);
        DB.cacheLocal();
        selectedStorageId = null;
        storageFormClear();
        refreshStorageSelects();
        toast('Location deleted', 'success');
        return;
      } catch (err) {
        toast(err.message || 'Failed to delete location', 'error');
        return;
      }
    }
    DB.storageLocations = DB.storageLocations.filter(x => x.id !== selectedStorageId);
    DB.save(); selectedStorageId = null; storageFormClear();
    refreshStorageSelects(); toast('Location deleted', 'success');
  });
}

// ============================================
// USER MANAGEMENT
// ============================================
function renderUserMgmtTable() {
  renderAdminUsersTable('userMgmtSearch', 'userMgmtRoleFilter', 'userMgmtTableBody');
}

function renderAdminUsersTable(searchId = 'adminUserSearch', roleId = null, bodyId = 'adminUsersTableBody') {
  const q = val(searchId).toLowerCase();
  const rf = roleId ? val(roleId) : '';
  let items = DB.users.filter(u =>
    (!q || u.firstName.toLowerCase().includes(q) || u.lastName.toLowerCase().includes(q) || u.salNumber.includes(q)) &&
    (!rf || u.role === rf)
  );
  const body = document.getElementById(bodyId);
  if (!body) return;
  if (!items.length) {
    body.innerHTML = '<tr class="table-empty"><td colspan="7">No users found</td></tr>';
    return;
  }
  body.innerHTML = items.map(u => `
    <tr>
      <td><strong>${u.salNumber}</strong></td>
      <td>${u.firstName} ${u.lastName}</td>
      <td><span class="list-item-badge ${u.role === 'admin' ? 'badge-admin' : 'badge-user'}">${roleLabel(u.role)}</span></td>
      <td><span class="list-item-badge ${u.status === 'Active' ? 'badge-active' : 'badge-inactive'}">${u.status}</span></td>
      <td><span class="list-item-badge ${u.canAccessLms ? 'badge-active' : 'badge-inactive'}">${u.canAccessLms ? 'Yes' : 'No'}</span></td>
      <td>${fmtDate(u.createdAt)}</td>
      <td>
        <button class="btn btn-sm btn-outline" onclick="editUser('${u.id}')">Edit</button>
        ${u.id !== currentUser?.id ? `<button class="btn btn-sm btn-danger" style="margin-left:4px" onclick="deleteUserDirect('${u.id}')">Del</button>` : ''}
      </td>
    </tr>
  `).join('');
}

function editUser(id) {
  navTo('adduser');
  setTimeout(() => { selectUser(id); }, 50);
}

function deleteUserDirect(id) {
  const u = DB.users.find(x => x.id === id);
  if (!u) return;
  if (u.id === currentUser?.id) return toast('You cannot delete yourself', 'error');
  confirm('Delete User', `Delete user "${u.firstName} ${u.lastName} (SAL: ${u.salNumber})"?`, 'Delete', 'btn-danger', async () => {
    if (DB.useApi && DB._apiReady && ManageITApi.getToken()) {
      try {
        await ManageITApi.deleteUser(id);
        DB.users = DB.users.filter(x => x.id !== id);
        DB.cacheLocal();
        renderUserMgmtTable();
        renderAdminUsersTable();
        toast('User deleted', 'success');
        return;
      } catch (err) {
        toast(err.message || 'Failed to delete user', 'error');
        return;
      }
    }
    DB.users = DB.users.filter(x => x.id !== id);
    DB.save();
    renderUserMgmtTable();
    renderAdminUsersTable();
    toast('User deleted', 'success');
  });
}

function renderUserList() {
  const q = val('addUserSearch').toLowerCase();
  const items = DB.users.filter(u => !q || u.firstName.toLowerCase().includes(q) || u.lastName.toLowerCase().includes(q) || u.salNumber.includes(q));
  document.getElementById('addUserCount').textContent = items.length + ' records';
  document.getElementById('userList').innerHTML = items.length ? items.map(u => `
    <div class="list-item ${selectedUserId === u.id ? 'selected' : ''}" onclick="selectUser('${u.id}')">
      <div class="list-item-avatar">${initials(u.firstName, u.lastName)}</div>
      <div class="list-item-info">
        <div class="list-item-primary">${u.firstName} ${u.lastName}</div>
        <div class="list-item-secondary">SAL: ${u.salNumber}${u.canAccessLms ? ' · LMS' : ''}</div>
      </div>
      <span class="list-item-badge ${u.role === 'admin' ? 'badge-admin' : 'badge-user'}">${roleLabel(u.role)}</span>
    </div>
  `).join('') : emptyState('user', 'No users found');
}

function selectUser(id) {
  selectedUserId = id;
  const u = DB.users.find(x => x.id === id);
  if (!u) return;
  show(document.getElementById('userFormContent'));
  hide(document.getElementById('userFormEmpty'));
  document.getElementById('userFormTitle').textContent = 'Edit User';
  setVal('fUserFirstName', u.firstName);
  setVal('fUserLastName', u.lastName);
  setVal('fUserSal', u.salNumber);
  setVal('fUserPassword', u.password);
  setVal('fUserRole', u.role);
  setVal('fUserStatus', u.status);
  const lmsChk = document.getElementById('fUserCanAccessLms');
  if (lmsChk) lmsChk.checked = !!u.canAccessLms;
  show(document.getElementById('userDeleteBtn'));
  renderUserList();
}

function userForm() {
  selectedUserId = null;
  show(document.getElementById('userFormContent'));
  hide(document.getElementById('userFormEmpty'));
  document.getElementById('userFormTitle').textContent = 'Add User';
  ['fUserFirstName','fUserLastName','fUserSal','fUserPassword'].forEach(id => setVal(id,''));
  setVal('fUserRole','viewer'); setVal('fUserStatus','Active');
  const lmsChk = document.getElementById('fUserCanAccessLms');
  if (lmsChk) lmsChk.checked = false;
  hide(document.getElementById('userDeleteBtn'));
  renderUserList();
}

function userFormClear() {
  selectedUserId = null;
  hide(document.getElementById('userFormContent'));
  show(document.getElementById('userFormEmpty'));
  renderUserList();
}

function saveUser() {
  if (!ManageITPerms.canEdit('UserManagement')) return toast('You do not have permission to manage users.', 'error');
  UI.clearFormErrors(['fUserFirstName', 'fUserLastName', 'fUserSal', 'fUserPassword']);
  const valid = UI.validateRequired([
    { id: 'fUserFirstName', message: 'Enter first name' },
    { id: 'fUserLastName', message: 'Enter last name' },
    { id: 'fUserSal', message: 'Enter SAL number' },
    { id: 'fUserPassword', message: 'Enter a password' }
  ]);
  if (!valid) return toast('Please fix the highlighted fields', 'error');

  const firstName = val('fUserFirstName');
  const lastName = val('fUserLastName');
  const sal = normalizeSalNumber(val('fUserSal'));
  const pwd = val('fUserPassword');
  const role = val('fUserRole');
  if (!isValidSalNumber(sal)) { UI.setFieldError('fUserSal', 'Enter a valid SAL number'); return toast('Enter a valid SAL number (letters, numbers, . _ - allowed, max 20 characters).', 'error'); }

  const canAccessLms = !!document.getElementById('fUserCanAccessLms')?.checked;
  const userPayload = {
    firstName, lastName, salNumber: sal, password: pwd,
    role, status: val('fUserStatus') || 'Active', canAccessLms
  };

  const btn = document.getElementById('userSaveBtn');
  UI.withButtonLoading(btn, 'Saving…', async () => {
    if (DB.useApi && DB._apiReady && ManageITApi.getToken()) {
      if (selectedUserId) {
        if (DB.users.find(u => u.salNumber === sal && u.id !== selectedUserId)) { toast('SAL number already used', 'error'); throw new Error('duplicate'); }
        const updated = await ManageITApi.updateUser(selectedUserId, userPayload);
        const idx = DB.users.findIndex(u => u.id === selectedUserId);
        if (idx >= 0) DB.users[idx] = updated;
        DB.logActivity(currentUser.firstName + ' ' + currentUser.lastName, 'Edit User', 'User Management', `Updated user ${firstName} ${lastName}`);
        toast('User updated', 'success');
      } else {
        if (DB.users.find(u => u.salNumber === sal)) { toast('SAL number already exists', 'error'); throw new Error('duplicate'); }
        const created = await ManageITApi.createUser(userPayload);
        DB.users.push(created);
        DB.logActivity(currentUser.firstName + ' ' + currentUser.lastName, 'Add User', 'User Management', `Created user ${firstName} ${lastName}`);
        toast('User added', 'success');
      }
      DB.cacheLocal();
      FormDirty.clear('userForm');
      renderUserList();
      renderAdminUsersTable();
      return;
    }

    if (selectedUserId) {
      if (DB.users.find(u => u.salNumber === sal && u.id !== selectedUserId)) { toast('SAL number already used', 'error'); throw new Error('duplicate'); }
      const idx = DB.users.findIndex(u => u.id === selectedUserId);
      DB.users[idx] = { ...DB.users[idx], firstName, lastName, salNumber: sal, password: pwd, role, status: val('fUserStatus'), canAccessLms };
      DB.logActivity(currentUser.firstName + ' ' + currentUser.lastName, 'Edit User', 'User Management', `Updated user ${firstName} ${lastName}`);
      toast('User updated', 'success');
    } else {
      if (DB.users.find(u => u.salNumber === sal)) { toast('SAL number already exists', 'error'); throw new Error('duplicate'); }
      DB.users.push({ id: uid(), firstName, lastName, salNumber: sal, password: pwd, role, status: val('fUserStatus') || 'Active', canAccessLms, createdAt: new Date().toISOString() });
      DB.logActivity(currentUser.firstName + ' ' + currentUser.lastName, 'Add User', 'User Management', `Created user ${firstName} ${lastName}`);
      toast('User added', 'success');
    }
    FormDirty.clear('userForm');
    DB.save();
    renderUserList();
    renderAdminUsersTable();
  }).catch(err => { if (err.message !== 'duplicate') toast(err.message || 'Failed to save user', 'error'); });
}

function deleteUserConfirm() {
  const u = DB.users.find(x => x.id === selectedUserId);
  if (!u) return;
  if (u.id === currentUser?.id) return toast('You cannot delete yourself', 'error');
  confirm('Delete User', `Delete user "${u.firstName} ${u.lastName}"?`, 'Delete', 'btn-danger', async () => {
    if (DB.useApi && DB._apiReady && ManageITApi.getToken()) {
      try {
        await ManageITApi.deleteUser(selectedUserId);
        DB.users = DB.users.filter(x => x.id !== selectedUserId);
        DB.cacheLocal();
        selectedUserId = null;
        userFormClear();
        renderAdminUsersTable();
        toast('User deleted', 'success');
        return;
      } catch (err) {
        toast(err.message || 'Failed to delete user', 'error');
        return;
      }
    }
    DB.users = DB.users.filter(x => x.id !== selectedUserId);
    DB.save();
    selectedUserId = null;
    userFormClear();
    toast('User deleted', 'success');
  });
}

// ============================================
// KPI REPORTS
// ============================================
function refreshKPIs() {
  document.getElementById('kpiTotalItems').textContent = DB.stock.length;
  document.getElementById('kpiBookIns').textContent = DB.transactions.filter(t => t.type === 'Book In').length;
  document.getElementById('kpiBookOuts').textContent = DB.transactions.filter(t => t.type === 'Book Out').length;
  document.getElementById('kpiTransfers').textContent = DB.transactions.filter(t => t.type === 'Transfer').length;

  // Category donut
  const catCounts = {};
  STOCK_CATEGORIES.forEach(c => { catCounts[c] = DB.stock.filter(s => s.stockCategory === c).length; });
  const catColors = ['#3860b2','#27ae60','#e67e22'];
  const total = Object.values(catCounts).reduce((a,b) => a+b, 0) || 1;
  document.getElementById('kpiCategoryChart').innerHTML = `
    <div style="position:relative;width:120px;height:120px;flex-shrink:0">
      ${renderDonutSVG(Object.values(catCounts), catColors)}
    </div>
    <div class="donut-legend">
      ${STOCK_CATEGORIES.map((c,i) => `
        <div class="donut-legend-item">
          <div class="donut-dot" style="background:${catColors[i]}"></div>
          <span>${c}: <strong>${catCounts[c]}</strong></span>
        </div>
      `).join('')}
    </div>
  `;

  // Location bar chart
  const locCounts = {};
  DB.stock.forEach(s => { if (s.storageLocation) locCounts[s.storageLocation] = (locCounts[s.storageLocation] || 0) + 1; });
  const topLocs = Object.entries(locCounts).sort((a,b) => b[1]-a[1]).slice(0,7);
  const maxLoc = topLocs[0]?.[1] || 1;
  document.getElementById('kpiLocationChart').innerHTML = topLocs.length ? topLocs.map(([name,cnt]) => `
    <div class="bar-row">
      <div class="bar-label" title="${name}">${name.split('(')[0].trim()}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.round(cnt/maxLoc*100)}%"></div></div>
      <div class="bar-val">${cnt}</div>
    </div>
  `).join('') : '<div class="list-empty">No data</div>';

  // Job type bar chart
  const jtCounts = {};
  DB.jobs.forEach(j => { jtCounts[j.jobType] = (jtCounts[j.jobType] || 0) + 1; });
  const topJT = Object.entries(jtCounts).sort((a,b) => b[1]-a[1]).slice(0,8);
  const maxJT = topJT[0]?.[1] || 1;
  document.getElementById('kpiJobTypeChart').innerHTML = topJT.length ? topJT.map(([t,cnt]) => `
    <div class="bar-row">
      <div class="bar-label">${UI.esc(t)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.round(cnt/maxJT*100)}%"></div></div>
      <div class="bar-val">${cnt}</div>
    </div>
  `).join('') : '<div class="list-empty">No jobs</div>';

  // Transaction activity last 30 days
  const now = Date.now();
  const days30 = 30 * 24 * 60 * 60 * 1000;
  const txTypes = ['Book In','Book Out','Transfer'];
  const txColors = ['#27ae60','#e74c3c','#e67e22'];
  const txCounts = txTypes.map(t => DB.transactions.filter(x => x.type === t && (now - new Date(x.timestamp).getTime()) < days30).length);
  const maxTx = Math.max(...txCounts, 1);
  document.getElementById('kpiTxChart').innerHTML = txTypes.map((t,i) => `
    <div class="bar-row">
      <div class="bar-label">${t}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.round(txCounts[i]/maxTx*100)}%;background:${txColors[i]}"></div></div>
      <div class="bar-val">${txCounts[i]}</div>
    </div>
  `).join('');
}

function renderDonutSVG(values, colors) {
  const total = values.reduce((a,b) => a+b, 0) || 1;
  const r = 50, cx = 60, cy = 60, stroke = 22;
  let cumulative = 0;
  const segments = values.map((v, i) => {
    const pct = v / total;
    const start = cumulative;
    cumulative += pct;
    const startAngle = start * 2 * Math.PI - Math.PI/2;
    const endAngle = cumulative * 2 * Math.PI - Math.PI/2;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const large = pct > 0.5 ? 1 : 0;
    return `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z" fill="${colors[i]}" opacity="0.85"/>`;
  });
  return `<svg viewBox="0 0 120 120" width="120" height="120">
    ${segments.join('')}
    <circle cx="${cx}" cy="${cy}" r="${stroke}" fill="white"/>
    <text x="${cx}" y="${cy+5}" text-anchor="middle" font-size="14" font-weight="bold" fill="#23344f">${total}</text>
  </svg>`;
}

// ============================================
// ACTIVITY / WORK ACTIVITY TABLES
// ============================================
function renderActivityTable() {
  const q = val('activitySearch').toLowerCase();
  const items = DB.activity.filter(a => !q || a.userName.toLowerCase().includes(q) || a.actionPerformed.toLowerCase().includes(q) || a.activityDescription.toLowerCase().includes(q));
  const body = document.getElementById('activityTableBody');
  if (!items.length) {
    body.innerHTML = '<tr class="table-empty"><td colspan="5">No activity records</td></tr>';
    return;
  }
  body.innerHTML = items.map(a => `
    <tr>
      <td>${fmtDateTime(a.timestamp)}</td>
      <td>${a.userName}</td>
      <td>${a.actionPerformed}</td>
      <td>${a.screenVisited}</td>
      <td>${a.activityDescription}</td>
    </tr>
  `).join('');
}

function renderWorkActivityTable() {
  const q = val('workActivitySearch').toLowerCase();
  const items = DB.activity.filter(a => !a.actionPerformed.includes('Login') && !a.actionPerformed.includes('Logout') &&
    (!q || a.userName.toLowerCase().includes(q) || a.actionPerformed.toLowerCase().includes(q) || a.stockNumber?.toLowerCase().includes(q))
  );
  const body = document.getElementById('workActivityTableBody');
  if (!items.length) {
    body.innerHTML = '<tr class="table-empty"><td colspan="6">No work activity</td></tr>';
    return;
  }
  body.innerHTML = items.map(a => `
    <tr>
      <td>${fmtDateTime(a.timestamp)}</td>
      <td>${a.userName}</td>
      <td>${a.actionPerformed}</td>
      <td>${a.stockNumber || '—'}</td>
      <td>${a.activityDescription}</td>
      <td>${a.quantity || '—'}</td>
    </tr>
  `).join('');
}

// ============================================
// ADMIN HOME
// ============================================
function renderAdminHome() {
  document.getElementById('adminStatUsers').textContent = DB.users.length;
  document.getElementById('adminStatStock').textContent = DB.stock.length;
  document.getElementById('adminStatJobs').textContent = DB.jobs.length;
  document.getElementById('adminStatActivity').textContent = DB.activity.length;
  const assetStat = document.getElementById('adminStatAssets');
  if (assetStat) assetStat.textContent = (DB.assets || []).length;
  const dateEl = document.getElementById('adminHomeDate');
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  if (typeof hydrateIcons === 'function') hydrateIcons(document.getElementById('page-adminhome'));
}

// ============================================
// EXPORT (professional Excel via excel-export.js)
// ============================================
function exportCSV(type) {
  return exportExcel(type);
}

function exportAllData() {
  return exportAllExcel();
}

// ============================================
// SETTINGS
// ============================================
async function saveSetting(key, value) {
  DB.settings[key] = value;
  if (isApiMode()) {
    try {
      const updated = await ManageITApi.updateSettings(DB.settings);
      DB.settings = updated;
      DB.cacheLocal();
    } catch (err) {
      DB.save();
      return toast(err.message || 'Failed to save setting to SQL', 'error');
    }
  } else {
    DB.save();
  }
  toast('Setting saved', 'success');
}

function resetToDemo() {
  localStorage.clear();
  DB.users = []; DB.jobs = []; DB.stock = []; DB.activity = [];
  DB.transactions = []; DB.storageLocations = []; DB.audits = []; DB.reconciliations = [];
  DB.assets = []; DB.assetMaintenance = [];
  DB.settings = {};
  DB.seed();
  toast('Demo data restored', 'success');
  refreshPage(qs('.page.active')?.id?.replace('page-','') || 'dashboard');
}

// ============================================
// INIT
// ============================================
function setupUX() {
  UI.setupModalA11y();
  UI.applyTableDensity();
  UI.setupBarcodeField('biFStockNum');
  UI.setupBarcodeField('boFStockNum');
  FormDirty.watch('jobForm', ['fJobNumber', 'fJobType', 'fJobDesc', 'fJobOrderConf', 'fJobCategory', 'fJobStatus']);
  FormDirty.watch('stockForm', ['fStockNumber', 'fPartDesc', 'fStockCategory', 'fPartNumber', 'fSerialNumber', 'fQty', 'fPoNumber', 'fStorageLocation', 'fTrayBin', 'fStockJobNum', 'fJobCatStock']);
  FormDirty.watch('userForm', ['fUserFirstName', 'fUserLastName', 'fUserSal', 'fUserPassword', 'fUserRole', 'fUserStatus']);
  document.getElementById('biFStockNum')?.addEventListener('input', () => updateTxSteps('bi', val('biFStockNum') ? 2 : 1));
  document.getElementById('biFQty')?.addEventListener('input', () => updateTxSteps('bi', val('biFQty') ? 2 : (val('biFStockNum') ? 2 : 1)));
  document.getElementById('boFStockNum')?.addEventListener('input', () => updateTxSteps('bo', val('boFStockNum') ? 2 : 1));
  document.getElementById('boFQty')?.addEventListener('input', () => updateTxSteps('bo', val('boFQty') ? 2 : (val('boFStockNum') ? 2 : 1)));
}

window.enterPortal = enterPortal;
window.exitPortal = exitPortal;
window.openLmsPortal = openLmsPortal;
window.invLabel = invLabel;

async function init() {
  showAppLoader(true);
  await DB.initData();
  if (typeof refreshLoginLmsVisibility === 'function') refreshLoginLmsVisibility();
  populateSelects();
  setupUX();
  if (typeof initSerialDropdowns === 'function') initSerialDropdowns();

  // Apply settings to inputs
  if (DB.settings.company) setVal('settingCompany', DB.settings.company);
  if (DB.settings.lowStockThreshold) setVal('settingLowStock', DB.settings.lowStockThreshold);
  const lsa = document.getElementById('settingLowStockAlert');
  if (lsa) lsa.checked = DB.settings.lowStockAlert !== false;
  const ala = document.getElementById('settingActivityLog');
  if (ala) ala.checked = DB.settings.activityLog !== false;

  // Hide job fields in book-in/out initially
  setBookInMode('general');
  applyPortalUI();

  // Restore session when token is valid (validated via /api/auth/me)
  if (ManageITApi.getToken() && DB._apiReady) {
    try {
      const profile = await ManageITApi.me();
      const user = profile.user || profile;
      if (user.status === 'Inactive') {
        handleSessionExpired('This account is inactive. Contact your administrator.');
        showAppLoader(false);
        return;
      }
      applyLoggedInUI(user, profile.permissions, profile.roleDisplayName);
      applyPortalUI();
      navTo('home');
      showAppLoader(false);
      return;
    } catch (e) {
      handleSessionExpired('Session expired. Please sign in again.');
      showAppLoader(false);
      return;
    }
  }
  applyPortalUI();
  showAppLoader(false);
}

function showAppLoader(show) {
  let el = document.getElementById('appLoader');
  if (!el) {
    el = document.createElement('div');
    el.id = 'appLoader';
    el.className = 'app-loader';
    el.innerHTML = '<div class="app-loader-spinner"></div><div class="app-loader-text">Loading ManageIT…</div>';
    document.body.appendChild(el);
  }
  el.classList.toggle('visible', show);
}

// ============================================
// IMPORT (Excel / CSV)
// ============================================

let importState = {
  type: 'stock',      // 'stock' | 'jobs' | 'users' | 'storage' | 'assets'
  rawRows: [],
  headers: [],
  mapping: {},
  rowInfo: [],
  selected: new Set(),
  step: 1,
  lockType: false
};

const IMPORT_TYPE_LABELS = {
  stock: 'Inventory Items',
  jobs: 'Jobs',
  users: 'Users',
  storage: 'Storage Locations',
  assets: 'Assets'
};

// Field definitions for each import type.
// type + max mirror the SQL column definitions so Excel and SQL accept the same values.
const IMPORT_FIELDS = {
  stock: [
    { key: 'stockNumber',    label: 'Stock Number',      required: true,  max: 30,  aliases: ['stock number','stock #','stock no','stocknumber','stock_number','item number','item no','code','inventory code','item code','inventory number','inventory #'] },
    { key: 'partNumber',     label: 'Part Number',       required: false, max: 50,  aliases: ['part number','part #','part no','partnumber','part_number','part num'] },
    { key: 'partDescription',label: 'Part Description',  required: false, max: 255, aliases: ['description','part description','desc','part desc','item description','name','part name'] },
    { key: 'serialNumber',   label: 'Serial Number',     required: false, max: 50,  aliases: ['serial','serial number','serial no','serialnumber','serial_number','s/n'] },
    { key: 'quantity',       label: 'Quantity',          required: false, type: 'int', aliases: ['quantity','qty','amount','stock qty','quantity on hand','qoh','unposted','on hand','onhand'] },
    { key: 'stockCategory',  label: 'Stock Category',    required: false, max: 30,  aliases: ['category','stock category','type','stock type','cat','group'] },
    { key: 'storageLocation',label: 'Storage Location',  required: false, max: 100, aliases: ['location','storage location','store','storage','bin location','warehouse'] },
    { key: 'trayBin',        label: 'Tray / Bin',        required: false, max: 50,  aliases: ['tray','bin','tray/bin','bin number','tray number','slot'] },
    { key: 'poNumber',       label: 'PO Number',         required: false, max: 50,  aliases: ['po number','po#','purchase order','po','order number','po no'] },
    { key: 'jobNumber',      label: 'Job Number',        required: false, max: 30,  aliases: ['job number','job#','job no','job','job num'] },
    { key: 'jobCategory',    label: 'Job Category',      required: false, max: 50,  aliases: ['job category','job cat','job type category'] },
  ],
  jobs: [
    { key: 'jobNumber',      label: 'Job Number',        required: true,  max: 30,  aliases: ['job number','job#','job no','job','number','job num','job_number'] },
    { key: 'jobDescription', label: 'Job Description',   required: true,  max: 255, aliases: ['description','job description','desc','name','job name','title'] },
    { key: 'jobType',        label: 'Job Type',          required: false, max: 1,   aliases: ['type','job type','category code','code'] },
    { key: 'orderConfirmation',label: 'Order Confirmation',required: false,max: 100, aliases: ['order confirmation','order conf','oc','order ref','reference','order number'] },
    { key: 'category',       label: 'Job Category',      required: false, max: 50,  aliases: ['category','job category','cat'] },
    { key: 'status',         label: 'Status',            required: false, max: 20,  aliases: ['status','job status','state'] },
  ],
  users: [
    { key: 'salNumber',      label: 'SAL Number',        required: true,  type: 'digits', max: 20, aliases: ['sal number','sal#','sal no','sal','employee number','emp no','staff number'] },
    { key: 'firstName',      label: 'First Name',        required: true,  max: 50,  aliases: ['first name','firstname','first','given name','name'] },
    { key: 'lastName',       label: 'Last Name',         required: true,  max: 50,  aliases: ['last name','lastname','surname','last','family name'] },
    { key: 'password',       label: 'Password',          required: false, type: 'raw', max: 255, aliases: ['password','pass','pwd'] },
    { key: 'role',           label: 'Role',              required: false, max: 20,  aliases: ['role','user role','access','level','type'] },
    { key: 'status',         label: 'Status',            required: false, max: 20,  aliases: ['status','active','state'] },
    { key: 'canAccessLms',   label: 'LMS Access',        required: false, max: 10,  aliases: ['lms','lms access','can access lms','canaccesslms','scope of work'] },
  ],
  storage: [
    { key: 'name',           label: 'Location Name',     required: true,  max: 100, aliases: ['location name','location','name','storage location','store','warehouse'] },
    { key: 'description',    label: 'Description',       required: false, max: 255, aliases: ['description','desc','details','notes'] },
    { key: 'building',       label: 'Building / Area',   required: false, max: 100, aliases: ['building','building / area','area','zone','section'] },
    { key: 'type',           label: 'Type',              required: false, max: 50,  aliases: ['type','location type','storage type','hanel','shelf','bin','rack'] },
  ],
  assets: [
    { key: 'assetNumber',    label: 'Asset Number',      required: true,  max: 30,  aliases: ['asset number','asset #','asset no','assetnumber','asset_number','tag number'] },
    { key: 'assetName',      label: 'Asset Name',        required: true,  max: 255, aliases: ['asset name','name','description','title','equipment name'] },
    { key: 'description',    label: 'Description',       required: false, max: 500, aliases: ['description','desc','details','notes'] },
    { key: 'category',       label: 'Category',          required: false, max: 50,  aliases: ['category','type','asset category','asset type'] },
    { key: 'manufacturer',   label: 'Manufacturer',      required: false, max: 100, aliases: ['manufacturer','make','brand','vendor'] },
    { key: 'model',          label: 'Model',             required: false, max: 100, aliases: ['model','model number','model no'] },
    { key: 'serialNumber',   label: 'Serial Number',     required: false, max: 80,  aliases: ['serial','serial number','serial no','s/n'] },
    { key: 'assetTag',       label: 'Asset Tag',         required: false, max: 50,  aliases: ['asset tag','tag','barcode','qr','tag number'] },
    { key: 'status',         label: 'Status',            required: false, max: 20,  aliases: ['status','asset status','state'] },
    { key: 'condition',      label: 'Condition',         required: false, max: 20,  aliases: ['condition','asset condition'] },
    { key: 'storageLocation',label: 'Location',          required: false, max: 100, aliases: ['location','storage location','storage','warehouse','site'] },
    { key: 'jobNumber',      label: 'Job Number',        required: false, max: 30,  aliases: ['job number','job','allocated job'] },
    { key: 'assignedTo',     label: 'Assigned To',       required: false, max: 100, aliases: ['assigned to','custodian','owner','user','assigned'] },
    { key: 'department',     label: 'Department',        required: false, max: 100, aliases: ['department','dept','division'] },
    { key: 'purchaseDate',   label: 'Purchase Date',     required: false, type: 'date', aliases: ['purchase date','acquired','date purchased'] },
    { key: 'purchaseCost',   label: 'Purchase Cost',     required: false, type: 'decimal', aliases: ['purchase cost','cost','purchase price','value'] },
    { key: 'currentValue',   label: 'Current Value',     required: false, type: 'decimal', aliases: ['current value','book value','net value'] },
    { key: 'warrantyExpiry', label: 'Warranty Expiry',   required: false, type: 'date', aliases: ['warranty expiry','warranty','warranty end'] },
    { key: 'nextInspectionDue', label: 'Next Inspection', required: false, type: 'date', aliases: ['next inspection','inspection due','next inspection due'] },
  ]
};

// ============================================
// IMPORT VALUE RULES (shared by Excel + SQL)
// Text may only contain letters, digits, spaces and . , - _ / ( ) & # ' + : %
// Numbers accept Excel's comma decimal (1234,56) and store SQL's dot form (1234.56)
// ============================================
const IMPORT_TEXT_ALLOWED = /^[\p{L}\p{N} .,\-_\/()&#'+:%=]*$/u;

function importCleanText(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim();
}

function importSanitizeText(raw) {
  let text = importCleanText(raw);
  if (!text) return '';
  if (!IMPORT_TEXT_ALLOWED.test(text)) {
    text = text.replace(/[^\p{L}\p{N} .,\-_\/()&#'+:%=@]/gu, ' ').replace(/\s+/g, ' ').trim();
  }
  return text;
}

function importNormalizeNumber(raw) {
  if (raw === null || raw === undefined || raw === '') return { ok: true, value: null };
  if (typeof raw === 'number') return isFinite(raw) ? { ok: true, value: raw } : { ok: false };

  let s = String(raw).trim();
  if (!s) return { ok: true, value: null };

  // Excel / sheet placeholders for blank — not real numbers
  if (/^[-–—−]+$/.test(s) || /^(n\/?a|null|none|blank|#n\/a)$/i.test(s)) {
    return { ok: true, value: null };
  }

  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  s = s.replace(/[R$€£]/gi, '').replace(/[\s\u00A0]/g, '');
  if (s.endsWith('-')) { negative = true; s = s.slice(0, -1); }
  if (s.startsWith('-') || s.startsWith('−')) { negative = true; s = s.slice(1); }
  if (s.startsWith('+')) s = s.slice(1);
  s = s.trim();
  if (!s) return { ok: true, value: null };

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    const decSep = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.';
    const thouSep = decSep === ',' ? '.' : ',';
    s = s.split(thouSep).join('');
    s = s.split(decSep).join('.');
  } else if (hasComma) {
    const parts = s.split(',');
    const thousands = parts.length > 2 ||
      (parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3 && /^\d+$/.test(parts[0]));
    s = thousands ? parts.join('') : parts.join('.');
  }

  if (!/^\d+(\.\d+)?$/.test(s)) return { ok: false };
  const n = parseFloat(s);
  if (!isFinite(n)) return { ok: false };
  return { ok: true, value: negative ? -n : n };
}

function importIsoDate(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function importNormalizeDate(raw) {
  if (raw === null || raw === undefined || raw === '') return { ok: true, value: null };
  if (raw instanceof Date) return isNaN(raw) ? { ok: false } : { ok: true, value: importIsoDate(raw) };

  if (typeof raw === 'number') {
    const d = new Date(Date.UTC(1899, 11, 30) + raw * 86400000);
    return isNaN(d) ? { ok: false } : { ok: true, value: importIsoDate(d) };
  }

  const s = String(raw).trim();
  if (!s) return { ok: true, value: null };

  let m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
  if (m) {
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return isNaN(d) ? { ok: false } : { ok: true, value: importIsoDate(d) };
  }
  m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/);
  if (m) {
    const d = new Date(+m[3], +m[2] - 1, +m[1]);
    return isNaN(d) ? { ok: false } : { ok: true, value: importIsoDate(d) };
  }
  const parsed = new Date(s);
  return isNaN(parsed) ? { ok: false } : { ok: true, value: importIsoDate(parsed) };
}

function parseSpreadsheetSheet(sheet) {
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!matrix.length) return { rows: [], headers: [], headerRowIndex: 0 };

  const norm = cell => String(cell || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const headerKeywords = ['code', 'description', 'desc', 'unposted', 'onhand', 'quantity', 'qty', 'group', 'unit', 'cost', 'value'];
  let headerIdx = -1;
  let bestScore = 0;

  matrix.forEach((row, i) => {
    const cells = row.map(norm).filter(Boolean);
    if (!cells.length) return;
    const hasCode = cells.some(c => c === 'code' || c === 'stocknumber' || c === 'inventorynumber');
    const hasDesc = cells.some(c => c.includes('description') || c === 'desc');
    const score = cells.filter(c => headerKeywords.some(k => c === k || c.includes(k))).length;
    if (hasCode && hasDesc && score > bestScore) {
      bestScore = score;
      headerIdx = i;
    }
  });

  if (headerIdx < 0) {
    headerIdx = matrix.findIndex(row => {
      const cells = row.map(norm);
      return cells.some(c => c === 'code') && cells.some(c => c.includes('description') || c === 'desc');
    });
  }
  if (headerIdx < 0) headerIdx = 0;

  const headers = matrix[headerIdx].map((h, i) => {
    const label = String(h || '').trim();
    return label || `Column_${i + 1}`;
  });

  const rows = [];
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const obj = {};
    headers.forEach((h, j) => { obj[h] = matrix[i][j] ?? ''; });
    if (Object.values(obj).every(v => String(v ?? '').trim() === '')) continue;
    rows.push(obj);
  }
  return { rows, headers, headerRowIndex: headerIdx };
}

function importSkipStockRow(values, row) {
  const code = String(values.stockNumber || '').trim();
  const desc = String(values.partDescription || '').trim();
  const rowText = Object.values(row || {}).map(v => String(v ?? '').trim()).filter(Boolean).join(' ');
  const allText = [code, desc, rowText].filter(Boolean).join(' ');

  if (!allText) return true;
  if (/^prepared by\b/i.test(allText) || /inventory valuation/i.test(allText)) return true;
  if (/^total\b/i.test(code) || /^total\b/i.test(desc)) return true;
  if (/inventory category/i.test(allText)) return true;
  if (code.toLowerCase() === 'code' && !desc) return true;
  return false;
}

function importValidateRow(row, fields, mapping) {
  const values = {};
  const issues = [];

  fields.forEach(f => {
    const header = mapping[f.key];
    const raw = header ? row[header] : '';
    const type = f.type || 'text';

    if (type === 'int' || type === 'decimal') {
      const res = importNormalizeNumber(raw);
      if (!res.ok) { issues.push(`${f.label}: not a valid number`); values[f.key] = null; return; }
      values[f.key] = res.value === null ? null : (type === 'int' ? Math.round(res.value) : res.value);
      return;
    }

    if (type === 'date') {
      const res = importNormalizeDate(raw);
      if (!res.ok) { issues.push(`${f.label}: not a valid date`); values[f.key] = null; return; }
      values[f.key] = res.value;
      return;
    }

    if (type === 'digits') {
      const digits = String(raw ?? '').replace(/[\s\u00A0]/g, '');
      if (digits && !/^\d+$/.test(digits)) { issues.push(`${f.label}: digits only`); }
      values[f.key] = digits;
    } else if (type === 'raw') {
      values[f.key] = String(raw ?? '').trim();
    } else {
      values[f.key] = importSanitizeText(raw);
    }

    const value = values[f.key];
    if (f.max && value && value.length > f.max) issues.push(`${f.label}: longer than ${f.max} characters`);
    if (f.required && !value) issues.push(`${f.label} is required`);
  });

  fields.forEach(f => {
    if (!f.required) return;
    if ((f.type === 'int' || f.type === 'decimal') && (values[f.key] === null || values[f.key] === undefined)) {
      issues.push(`${f.label} is required`);
    }
  });

  if (importState.type === 'stock' && importSkipStockRow(values, row)) {
    return { valid: false, skipped: true, issues: [], values };
  }

  if (importState.type === 'stock' && values.stockNumber && !values.partDescription) {
    values.partDescription = values.stockNumber;
  }

  return { valid: issues.length === 0, issues, values };
}

function openImportModal(type = 'stock') {
  if (type === 'assets' && currentUser && !ManageITPerms.canEdit('AssetManagement')) {
    return toast('You do not have permission to import assets.', 'error');
  }
  importState = { type, rawRows: [], headers: [], mapping: {}, rowInfo: [], selected: new Set(), step: 1, lockType: true };
  setImportType(type);
  document.querySelectorAll('input[name="importType"]').forEach(r => r.checked = r.value === type);
  const typePicker = document.getElementById('importTypePicker');
  if (typePicker) typePicker.classList.toggle('hidden', true);
  showImportStep(1);
  document.getElementById('importFileName').textContent = '';
  document.getElementById('importFileInput').value = '';
  document.getElementById('importModal').classList.add('open');
  document.getElementById('importNextBtn').classList.remove('hidden');
  document.getElementById('importNextBtn').disabled = true;
  document.getElementById('importRunBtn').classList.add('hidden');
  document.getElementById('importModalTitle').innerHTML = iconLabel('upload', `Import ${IMPORT_TYPE_LABELS[type] || type}`);
}

function openImportModalGeneral() {
  importState = { type: 'stock', rawRows: [], headers: [], mapping: {}, rowInfo: [], selected: new Set(), step: 1, lockType: false };
  setImportType('stock');
  document.querySelectorAll('input[name="importType"]').forEach(r => r.checked = r.value === 'stock');
  const typePicker = document.getElementById('importTypePicker');
  if (typePicker) typePicker.classList.remove('hidden');
  showImportStep(1);
  document.getElementById('importFileName').textContent = '';
  document.getElementById('importFileInput').value = '';
  document.getElementById('importModal').classList.add('open');
  document.getElementById('importNextBtn').classList.remove('hidden');
  document.getElementById('importNextBtn').disabled = true;
  document.getElementById('importRunBtn').classList.add('hidden');
  document.getElementById('importModalTitle').innerHTML = iconLabel('upload', 'Import Data');
}

function closeImportModal() {
  document.getElementById('importModal').classList.remove('open');
}

function setImportType(type) {
  importState.type = type;
}

function showImportStep(step) {
  importState.step = step;
  document.getElementById('importStep1').classList.toggle('hidden', step !== 1);
  document.getElementById('importStep2').classList.toggle('hidden', step !== 2);
  document.getElementById('importStep3').classList.toggle('hidden', step !== 3);
  const nextBtn = document.getElementById('importNextBtn');
  const runBtn = document.getElementById('importRunBtn');
  if (step === 1) { nextBtn.classList.remove('hidden'); runBtn.classList.add('hidden'); }
  if (step === 2) { nextBtn.classList.add('hidden'); runBtn.classList.remove('hidden'); }
  if (step === 3) { nextBtn.classList.add('hidden'); runBtn.classList.add('hidden'); }
}

function importGoBack() {
  showImportStep(1);
  document.getElementById('importNextBtn').classList.remove('hidden');
  document.getElementById('importNextBtn').disabled = importState.rawRows.length === 0;
}

function handleImportDrop(event) {
  event.preventDefault();
  document.getElementById('importDropzone').style.borderColor = 'var(--border)';
  const file = event.dataTransfer.files[0];
  if (file) processImportFile(file);
}

function handleImportFile(input) {
  if (input.files[0]) processImportFile(input.files[0]);
}

function processImportFile(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  document.getElementById('importFileName').innerHTML = iconLabel('file', file.name);
  const reader = new FileReader();

  reader.onload = function(e) {
    try {
      let rows = [];
      if (ext === 'json') {
        const parsed = JSON.parse(e.target.result);
        rows = Array.isArray(parsed) ? parsed : (parsed.data || parsed.rows || parsed.items || [parsed]);
        rows = rows.filter(r => r && typeof r === 'object');
        if (!rows.length) return toast('JSON file has no importable rows', 'error');
        importState.rawRows = rows;
        importState.headers = Object.keys(rows[0]);
      } else {
        let workbook;
        const readOpts = { type: ext === 'csv' || ext === 'txt' ? 'string' : 'array', cellDates: true };
        if (ext === 'tsv') readOpts.FS = '\t';
        if (ext === 'csv' || ext === 'txt' || ext === 'tsv') {
          workbook = XLSX.read(e.target.result, { ...readOpts, type: 'string' });
        } else {
          workbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });
        }
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const parsed = parseSpreadsheetSheet(sheet);
        rows = parsed.rows;
        if (!rows.length) return toast('File is empty or has no data rows', 'error');
        importState.rawRows = rows;
        importState.headers = parsed.headers;
        importState.headerRowIndex = parsed.headerRowIndex ?? 0;
      }

      document.getElementById('importNextBtn').disabled = false;
      const sage = importState.type === 'stock' ? detectSageInventoryMapping(importState.headers) : null;
      toast(
        sage
          ? `Sage export loaded — ${importState.rawRows.length} rows (Code / Description / Unposted)`
          : `File loaded — ${importState.rawRows.length} rows, ${importState.headers.length} columns`,
        'success'
      );
    } catch(err) {
      toast('Failed to read file: ' + err.message, 'error');
    }
  };

  if (ext === 'json') reader.readAsText(file);
  else if (ext === 'csv' || ext === 'txt' || ext === 'tsv') reader.readAsText(file);
  else reader.readAsArrayBuffer(file);
}

function importNext() {
  if (!importState.rawRows.length) return toast('Please select a file first', 'error');
  buildMappingUI();
  showImportStep(2);
}

function detectSageInventoryMapping(headers) {
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const byNorm = {};
  headers.forEach(h => {
    const n = norm(h);
    if (n && !byNorm[n]) byNorm[n] = h;
  });
  if (!byNorm.code || !byNorm.description) return null;

  const mapping = {
    stockNumber: byNorm.code,
    partDescription: byNorm.description
  };
  if (byNorm.unposted) mapping.quantity = byNorm.unposted;
  else if (byNorm.onhand) mapping.quantity = byNorm.onhand;
  else if (byNorm.quantity) mapping.quantity = byNorm.quantity;
  else if (byNorm.qty) mapping.quantity = byNorm.qty;
  if (byNorm.group) mapping.stockCategory = byNorm.group;
  return mapping;
}

function autoDetectMapping(fields, headers) {
  const mapping = {};
  const normalise = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const normHeaders = headers.map(h => ({ raw: h, norm: normalise(h) }));

  fields.forEach(f => {
    const aliases = [f.label, ...f.aliases].map(normalise).filter(Boolean);
    let matched = normHeaders.find(h => aliases.includes(h.norm));
    if (!matched) {
      matched = normHeaders.find(h =>
        f.aliases.some(a => {
          const na = normalise(a);
          if (na.length < 4) return false;
          return h.norm === na || h.norm.endsWith(na) || h.norm.startsWith(na);
        })
      );
    }
    if (matched) mapping[f.key] = matched.raw;
  });

  return mapping;
}

function buildMappingUI() {
  const fields = IMPORT_FIELDS[importState.type];
  importState.mapping = autoDetectMapping(fields, importState.headers);

  const sageMapping = importState.type === 'stock' ? detectSageInventoryMapping(importState.headers) : null;
  if (sageMapping) {
    importState.mapping = { ...importState.mapping, ...sageMapping };
    importState.sageFormat = true;
  } else {
    importState.sageFormat = false;
  }

  const blankOpt = '<option value="">— skip this field —</option>';

  document.getElementById('importSheetInfo').textContent =
    `${importState.rawRows.length} rows · ${importState.headers.length} columns detected` +
    (importState.sageFormat ? ' · Sage inventory export detected' : '');

  document.getElementById('importMappingGrid').innerHTML = importState.sageFormat
    ? `<div class="import-sage-banner">
        Sage inventory export — columns mapped automatically
        <span class="import-sage-cols">Code → Stock Number · Description → Part Description · Unposted → Quantity</span>
      </div>`
    : fields.map(f => `
    <div class="form-group">
      <label class="form-label" style="${f.required ? 'color:var(--navy)' : ''}">
        ${f.label}${f.required ? ' <span class="required">*</span>' : ''}
      </label>
      <select class="form-select" id="mapField_${f.key}" style="font-size:12px" onchange="importMappingChanged()">
        ${blankOpt}${importState.headers.map(h =>
          `<option value="${UI.esc(h)}" ${importState.mapping[f.key] === h ? 'selected' : ''}>${UI.esc(h)}</option>`
        ).join('')}
      </select>
    </div>
  `).join('');

  const hideInvalid = document.getElementById('importHideInvalid');
  if (hideInvalid) hideInvalid.checked = !!importState.sageFormat;

  importRevalidate();
}

function importCollectMapping() {
  const fields = IMPORT_FIELDS[importState.type];
  const mapping = {};
  fields.forEach(f => {
    const sel = document.getElementById('mapField_' + f.key);
    const value = sel ? sel.value : importState.mapping[f.key];
    if (value) mapping[f.key] = value;
  });
  return mapping;
}

function importMappingChanged() {
  importRevalidate();
}

// Re-check every row against the shared Excel/SQL rules, then pre-select the valid ones
function importRevalidate() {
  const fields = IMPORT_FIELDS[importState.type];
  importState.mapping = importCollectMapping();
  importState.rowInfo = importState.rawRows.map(row => importValidateRow(row, fields, importState.mapping));
  importState.selected = new Set();
  importState.rowInfo.forEach((info, i) => { if (info.valid) importState.selected.add(i); });

  const validCount = importState.rowInfo.filter(i => i.valid).length;
  const infoEl = document.getElementById('importSheetInfo');
  if (infoEl && importState.sageFormat && validCount > 0) {
    infoEl.textContent = `${validCount} inventory items ready to import`;
  }

  const runBtn = document.getElementById('importRunBtn');
  if (runBtn && importState.sageFormat && validCount > 0) {
    runBtn.innerHTML = iconLabel('upload', `Import ${validCount} items`);
  }

  renderImportPreview();
}

function renderImportPreview() {
  const fields = IMPORT_FIELDS[importState.type].filter(f => importState.mapping[f.key]);
  const info = importState.rowInfo || [];
  const hideInvalid = document.getElementById('importHideInvalid')?.checked;

  document.getElementById('importPreviewCount').textContent = importState.rawRows.length;

  const head = document.getElementById('importPreviewHead');
  const body = document.getElementById('importPreviewBody');
  if (!head || !body) return;

  head.innerHTML = '<tr>' +
    '<th class="import-check-col"><input type="checkbox" id="importSelectAllBox" onchange="importSelectAll(this.checked)" title="Select all valid rows" /></th>' +
    '<th class="import-row-col">Row</th>' +
    fields.map(f => `<th>${UI.esc(f.label)}</th>`).join('') +
    '<th>Status</th></tr>';

  const rows = importState.rawRows
    .map((row, idx) => ({ row, idx }))
    .filter(({ idx }) => {
      const ri = info[idx];
      if (ri?.skipped) return false;
      if (hideInvalid && !ri?.valid) return false;
      return true;
    });

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="${fields.length + 3}" class="import-empty">No rows to show</td></tr>`;
    updateImportSelectionUI();
    return;
  }

  body.innerHTML = rows.map(({ idx }) => {
    const rowInfo = info[idx] || { valid: false, issues: ['Not validated'], values: {} };
    const checked = importState.selected.has(idx) ? 'checked' : '';
    const cells = fields.map(f => {
      const v = rowInfo.values[f.key];
      return `<td>${UI.esc(v === null || v === undefined ? '' : v)}</td>`;
    }).join('');
    const status = rowInfo.valid
      ? '<span class="import-status-ok">Ready</span>'
      : rowInfo.skipped
        ? ''
        : `<span class="import-status-bad">${UI.esc(rowInfo.issues.join('; ') || 'Invalid row')}</span>`;
    return `<tr class="${rowInfo.valid ? '' : 'import-row-invalid'}">
      <td class="import-check-col"><input type="checkbox" ${checked} ${rowInfo.valid ? '' : 'disabled'} onchange="importToggleRow(${idx}, this.checked)" /></td>
      <td class="import-row-col">${(importState.headerRowIndex ?? 0) + idx + 2}</td>
      ${cells}
      <td>${status}</td>
    </tr>`;
  }).join('');

  updateImportSelectionUI();
}

function importToggleRow(idx, checked) {
  if (checked) importState.selected.add(idx);
  else importState.selected.delete(idx);
  updateImportSelectionUI();
}

function importSelectAll(checked) {
  importState.selected = new Set();
  if (checked) {
    importState.rowInfo.forEach((info, i) => { if (info.valid) importState.selected.add(i); });
  }
  renderImportPreview();
}

function updateImportSelectionUI() {
  const skippedCount = importState.rowInfo.filter(i => i.skipped).length;
  const validCount = importState.rowInfo.filter(i => i.valid).length;
  const invalidCount = importState.rowInfo.length - validCount - skippedCount;
  const selected = importState.selected.size;

  const countEl = document.getElementById('importSelectedCount');
  if (countEl) {
    if (importState.sageFormat && validCount > 0 && invalidCount === 0) {
      countEl.textContent = `${selected} of ${validCount} items ready`;
    } else {
      countEl.textContent = `${selected} of ${validCount} selected` +
        (skippedCount ? ` · ${skippedCount} header rows ignored` : '') +
        (invalidCount ? ` · ${invalidCount} need attention` : '');
    }
  }

  const allBox = document.getElementById('importSelectAllBox');
  if (allBox) {
    allBox.checked = validCount > 0 && selected === validCount;
    allBox.indeterminate = selected > 0 && selected < validCount;
  }

  const runBtn = document.getElementById('importRunBtn');
  if (runBtn) runBtn.disabled = selected === 0;
}

function runImport() {
  runImportAsync().catch(err => toast(err.message || 'Import failed', 'error'));
}

async function runImportAsync() {
  const fields = IMPORT_FIELDS[importState.type];
  const mapping = importState.mapping || {};

  // Validate required fields are mapped
  const missing = fields.filter(f => f.required && !mapping[f.key]).map(f => f.label);
  if (missing.length) return toast(`Map required fields: ${missing.join(', ')}`, 'error');

  const chosen = [...importState.selected].filter(i => importState.rowInfo[i]?.valid).sort((a, b) => a - b);
  if (!chosen.length) return toast('Select at least one row to import', 'error');

  const dupMode = val('importDupMode');
  let added = 0, updated = 0, skipped = 0, errors = 0;

  chosen.forEach(idx => {
    try {
      const rowValues = importState.rowInfo[idx].values;
      const get = key => {
        const v = rowValues[key];
        return v === null || v === undefined ? '' : v;
      };

      if (importState.type === 'stock') {
        const stockNumber = get('stockNumber');
        if (!stockNumber) { errors++; return; }
        const existing = DB.stock.find(s => s.stockNumber === stockNumber);
        const data = {
          stockNumber,
          partNumber:      get('partNumber'),
          partDescription: get('partDescription') || stockNumber,
          serialNumber:    get('serialNumber'),
          quantity:        rowValues.quantity ?? 0,
          stockCategory:   normaliseCategory(get('stockCategory')) || 'Production Inventory',
          storageLocation: get('storageLocation'),
          trayBin:         get('trayBin'),
          poNumber:        get('poNumber'),
          jobNumber:       get('jobNumber'),
          jobCategory:     normaliseJobCategory(get('jobCategory')) || get('jobCategory') || '',
        };
        if (existing) {
          if (dupMode === 'skip') { skipped++; return; }
          if (dupMode === 'update') { Object.assign(existing, data); updated++; return; }
        }
        DB.stock.push({ id: uid(), ...data, createdAt: new Date().toISOString() });
        added++;

      } else if (importState.type === 'jobs') {
        const jobNumber = get('jobNumber');
        if (!jobNumber) { errors++; return; }
        const existing = DB.jobs.find(j => j.jobNumber === jobNumber);
        const data = {
          jobNumber,
          jobDescription:    get('jobDescription') || jobNumber,
          jobType:           get('jobType').toUpperCase() || 'A',
          orderConfirmation: get('orderConfirmation'),
          category:          normaliseJobCategory(get('category')) || 'Production Inventory',
          status:            normaliseStatus(get('status')) || 'Active',
        };
        if (existing) {
          if (dupMode === 'skip') { skipped++; return; }
          if (dupMode === 'update') { Object.assign(existing, data); updated++; return; }
        }
        DB.jobs.push({ id: uid(), ...data, createdAt: new Date().toISOString() });
        added++;

      } else if (importState.type === 'users') {
        const salNumber = get('salNumber');
        const firstName = get('firstName');
        const lastName  = get('lastName');
        if (!salNumber || !firstName) { errors++; return; }
        if (!/^\d+$/.test(salNumber)) { errors++; return; }
        const existing = DB.users.find(u => u.salNumber === salNumber);
        const lmsRaw = String(get('canAccessLms') || '').trim().toLowerCase();
        const data = {
          salNumber, firstName, lastName,
          password: get('password') || 'changeme',
          role:     normaliseRole(get('role')) || 'user',
          status:   normaliseStatus(get('status')) || 'Active',
          canAccessLms: ['1', 'true', 'yes', 'y'].includes(lmsRaw),
        };
        if (existing) {
          if (dupMode === 'skip') { skipped++; return; }
          if (dupMode === 'update') { Object.assign(existing, data); updated++; return; }
        }
        DB.users.push({ id: uid(), ...data, createdAt: new Date().toISOString() });
        added++;

      } else if (importState.type === 'storage') {
        const name = get('name');
        if (!name) { errors++; return; }
        const existing = DB.storageLocations.find(s => s.name.toLowerCase() === name.toLowerCase());
        const data = {
          name,
          description: get('description'),
          building: get('building'),
          type: get('type') || 'Other',
        };
        if (existing) {
          if (dupMode === 'skip') { skipped++; return; }
          if (dupMode === 'update') { Object.assign(existing, data); updated++; return; }
        }
        DB.storageLocations.push({ id: uid(), ...data });
        added++;

      } else if (importState.type === 'assets') {
        const assetNumber = get('assetNumber');
        if (!assetNumber) { errors++; return; }
        if (!DB.assets) DB.assets = [];
        const existing = DB.assets.find(a => a.assetNumber === assetNumber);
        const data = {
          assetNumber,
          assetName: get('assetName') || assetNumber,
          description: get('description'),
          category: get('category'),
          manufacturer: get('manufacturer'),
          model: get('model'),
          serialNumber: get('serialNumber'),
          assetTag: get('assetTag'),
          status: get('status') || 'Active',
          condition: get('condition') || 'Good',
          storageLocation: get('storageLocation'),
          jobNumber: get('jobNumber'),
          assignedTo: get('assignedTo'),
          department: get('department'),
          purchaseDate: rowValues.purchaseDate ?? null,
          purchaseCost: rowValues.purchaseCost ?? null,
          currentValue: rowValues.currentValue ?? null,
          warrantyExpiry: rowValues.warrantyExpiry ?? null,
          nextInspectionDue: rowValues.nextInspectionDue ?? null,
          notes: ''
        };
        if (existing) {
          if (dupMode === 'skip') { skipped++; return; }
          if (dupMode === 'update') { Object.assign(existing, data); updated++; return; }
        }
        DB.assets.push({ id: uid(), ...data, createdAt: new Date().toISOString() });
        added++;
      }
    } catch(e) { errors++; }
  });

  DB.save();
  if (DB.useApi && DB._apiReady && ManageITApi.getToken()) {
    clearTimeout(DB._syncTimer);
    try {
      await DB.syncToApi();
    } catch (e) {
      toast('Imported locally but could not save to server — click Retry in the status bar', 'error');
    }
  }

  DB.logActivity(currentUser.firstName + ' ' + currentUser.lastName, 'Import', 'Import', `Imported ${importState.type}: ${added} added, ${updated} updated, ${skipped} skipped, ${errors} errors`);

  // Show result
  const total = added + updated;
  const resultEl = document.getElementById('importResultIcon');
  resultEl.dataset.icon = errors > 0 && total === 0 ? 'x' : 'check';
  resultEl.dataset.iconSize = '48';
  hydrateIcons(resultEl.parentElement);
  const notSelected = importState.rowInfo.length - chosen.length;
  document.getElementById('importResultTitle').textContent = total > 0 ? `Import complete!` : 'Nothing imported';
  document.getElementById('importResultDetail').innerHTML =
    `<strong>${added}</strong> records added &nbsp;·&nbsp; <strong>${updated}</strong> updated &nbsp;·&nbsp; <strong>${skipped}</strong> duplicates skipped &nbsp;·&nbsp; <strong>${errors}</strong> errors` +
    (notSelected > 0 ? `<div style="margin-top:6px">${notSelected} row${notSelected === 1 ? '' : 's'} were not selected or failed validation</div>` : '');
  showImportStep(3);

  // Refresh relevant pages
  renderStockList(); renderJobList(); renderUserList(); renderAdminUsersTable(); renderStorageList();
  if (typeof renderAssetManagementPage === 'function') renderAssetManagementPage();
  refreshStorageSelects();
  refreshKPIs(); renderDashboard();
  toast(`Import complete — ${added} added, ${updated} updated`, total > 0 ? 'success' : 'warning');
}

// Normalise helpers
function normaliseCategory(raw) {
  return normaliseStockCategory(raw);
}
function normaliseStatus(raw) {
  const r = (raw || '').toLowerCase();
  if (r.includes('active') || r === '1' || r === 'yes' || r === 'true') return 'Active';
  if (r.includes('hold')) return 'On Hold';
  if (r.includes('complet')) return 'Completed';
  if (r.includes('cancel')) return 'Cancelled';
  if (r.includes('inactiv') || r === '0' || r === 'no' || r === 'false') return 'Inactive';
  return '';
}
function normaliseRole(raw) {
  const r = (raw || '').toLowerCase();
  if (r.includes('admin') || r === '1') return 'admin';
  return 'user';
}

// Download import template (headers only — no sample rows)
async function downloadImportTemplate(type) {
  const t = type || importState?.type || 'stock';
  if (typeof ManageITExcel !== 'undefined') {
    const ok = await ManageITExcel.downloadTemplate(t);
    if (ok) return;
  }
  const templates = {
    stock: [['Inventory Number','Part Number','Part Description','Serial Number','Quantity','Category','Storage Location','Tray / Bin','PO Number','Job Number','Job Category']],
    jobs:  [['Job Number','Job Description','Job Type','Order Confirmation','Job Category','Status']],
    users: [['SAL Number','First Name','Last Name','Password','Role','Status']],
    storage: [['Location Name','Description','Building / Area','Type']],
    assets: [['Asset Number','Asset Name','Description','Category','Manufacturer','Model','Serial Number','Asset Tag','Status','Condition','Location','Job Number','Assigned To','Department','Purchase Date','Purchase Cost','Current Value','Warranty Expiry','Next Inspection']],
  };
  const rows = templates[t] || templates.stock;
  const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ManageIT_${t}_Template.csv`;
  a.click();
  toast('Download Template — column headings only, ready to fill in', 'info');
}

init();
