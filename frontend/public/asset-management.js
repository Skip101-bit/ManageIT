/**
 * ManageIT — Asset Management module
 */
'use strict';

const ASSET_CATEGORIES = ['Equipment', 'Vehicle', 'Tool', 'IT Hardware', 'Warehouse Equipment', 'Facility', 'Other'];
const ASSET_STATUSES = ['Active', 'In Use', 'In Storage', 'In Maintenance', 'Retired', 'Disposed', 'Lost'];
const ASSET_CONDITIONS = ['Excellent', 'Good', 'Fair', 'Poor'];
const MAINT_TYPES = ['Preventive', 'Corrective', 'Calibration', 'Inspection', 'Repair'];
const MAINT_STATUSES = ['Scheduled', 'In Progress', 'Completed', 'Cancelled'];

let selectedAssetId     = null;
let selectedMaintId     = null;
let assetActiveTab      = 'register';

function assetStatusBadge(status) {
  const map = {
    Active: 'badge-active', 'In Use': 'badge-active', 'In Storage': 'badge-user',
    'In Maintenance': 'badge-inactive', Retired: 'badge-inactive', Disposed: 'badge-inactive', Lost: 'badge-inactive'
  };
  return map[status] || 'badge-user';
}

function assetCanEdit() {
  return ManageITPerms.canEdit('AssetManagement');
}

function assetCanDelete() {
  return ManageITPerms.canFull('AssetManagement');
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d - new Date()) / 86400000);
}

function initAssetFormSelects() {
  const fill = (id, items, first) => {
    const el = document.getElementById(id);
    if (!el) return;
    const cur = el.value;
    el.innerHTML = (first || '') + items.map(v => `<option value="${UI.esc(v)}">${UI.esc(v)}</option>`).join('');
    if (cur) el.value = cur;
  };
  fill('fAssetCategory', ASSET_CATEGORIES, '<option value="">— Select category —</option>');
  fill('fAssetStatus', ASSET_STATUSES, '');
  fill('fAssetCondition', ASSET_CONDITIONS, '<option value="">— Select condition —</option>');
  fill('fMaintType', MAINT_TYPES, '');
  fill('fMaintStatus', MAINT_STATUSES, '');
  const catF = document.getElementById('assetCatFilter');
  if (catF && catF.options.length <= 1) {
    catF.innerHTML = '<option value="">All Categories</option>' + ASSET_CATEGORIES.map(c => `<option value="${UI.esc(c)}">${UI.esc(c)}</option>`).join('');
  }
  const statF = document.getElementById('assetStatusFilter');
  if (statF && statF.options.length <= 1) {
    statF.innerHTML = '<option value="">All Statuses</option>' + ASSET_STATUSES.map(s => `<option value="${UI.esc(s)}">${UI.esc(s)}</option>`).join('');
  }
}

function renderAssetManagementPage() {
  if (!DB.assets) DB.assets = [];
  if (!DB.assetMaintenance) DB.assetMaintenance = [];
  initAssetFormSelects();
  renderAssetStats();
  switchAssetTab(assetActiveTab);
  if (typeof hydrateIcons === 'function') hydrateIcons(document.getElementById('page-assetmanagement'));
}

function renderAssetStats() {
  const total = DB.assets.length;
  const active = DB.assets.filter(a => ['Active', 'In Use'].includes(a.status)).length;
  const inMaint = DB.assets.filter(a => a.status === 'In Maintenance').length;
  const due = DB.assets.filter(a => {
    const d = daysUntil(a.nextInspectionDue);
    return d !== null && d <= 30;
  }).length;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('assetStatTotal', total);
  set('assetStatActive', active);
  set('assetStatMaint', inMaint);
  set('assetStatDue', due);
}

function switchAssetTab(tab) {
  assetActiveTab = tab;
  document.querySelectorAll('.asset-tab-panel').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('#assetTabs .mode-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  const panel = document.getElementById('assetTab-' + tab);
  if (panel) panel.classList.remove('hidden');
  if (tab === 'register') renderAssetList();
  else if (tab === 'maintenance') renderMaintList();
  else if (tab === 'alerts') renderAssetAlerts();
  if (typeof hydrateIcons === 'function') hydrateIcons(document.getElementById('assetTabs'));
}

function renderAssetList() {
  const q = val('assetSearch').toLowerCase();
  const catF = val('assetCatFilter');
  const statF = val('assetStatusFilter');
  let items = DB.assets.filter(a =>
    (!q || a.assetNumber.toLowerCase().includes(q) || a.assetName.toLowerCase().includes(q) ||
      (a.serialNumber || '').toLowerCase().includes(q)) &&
    (!catF || a.category === catF) &&
    (!statF || a.status === statF)
  );
  const countEl = document.getElementById('assetCount');
  if (countEl) countEl.textContent = items.length + ' records';
  const list = document.getElementById('assetList');
  if (!list) return;
  if (!DB.assets.length) {
    list.innerHTML = UI.emptyListState('layers', 'assets', 'assetForm', '+ Add Asset');
    return;
  }
  if (!items.length) {
    list.innerHTML = UI.noResultsState('layers', 'clearAssetFilters');
    return;
  }
  list.innerHTML = items.map(a => `
    <div class="list-item ${selectedAssetId === a.id ? 'selected' : ''}" onclick="selectAsset('${UI.esc(a.id)}')">
      <div class="list-item-avatar icon-only" data-icon="layers" data-icon-size="16"></div>
      <div class="list-item-info">
        <div class="list-item-primary">${UI.esc(a.assetNumber)} · ${UI.esc(a.assetName)}</div>
        <div class="list-item-secondary">${UI.esc(a.category || '—')} · ${UI.esc(a.storageLocation || 'No location')}</div>
      </div>
      <span class="list-item-badge ${assetStatusBadge(a.status)}">${UI.esc(a.status)}</span>
    </div>
  `).join('');
  if (typeof hydrateIcons === 'function') hydrateIcons(list);
}

function clearAssetFilters() {
  setVal('assetSearch', '');
  setVal('assetCatFilter', '');
  setVal('assetStatusFilter', '');
  renderAssetList();
}

function populateAssetFormDropdowns() {
  const locSel = document.getElementById('fAssetLocation');
  if (locSel) {
    const cur = locSel.value;
    locSel.innerHTML = '<option value="">— Select location —</option>' +
      DB.storageLocations.map(l => `<option value="${UI.esc(l.name)}">${UI.esc(l.name)}</option>`).join('');
    if (cur) locSel.value = cur;
  }
  const jobSel = document.getElementById('fAssetJob');
  if (jobSel) {
    const cur = jobSel.value;
    jobSel.innerHTML = '<option value="">— Not allocated —</option>' +
      DB.jobs.filter(j => j.status === 'Active').map(j => `<option value="${UI.esc(j.jobNumber)}">${UI.esc(j.jobNumber)}</option>`).join('');
    if (cur) jobSel.value = cur;
  }
  const userSel = document.getElementById('fAssetAssigned');
  if (userSel) {
    const cur = userSel.value;
    userSel.innerHTML = '<option value="">— Unassigned —</option>' +
      DB.users.filter(u => u.status === 'Active').map(u => `<option value="${UI.esc(u.firstName + ' ' + u.lastName)}">${UI.esc(u.firstName + ' ' + u.lastName)}</option>`).join('');
    if (cur) userSel.value = cur;
  }
  const assetSel = document.getElementById('fMaintAsset');
  if (assetSel) {
    const cur = assetSel.value;
    assetSel.innerHTML = '<option value="">— Select asset —</option>' +
      DB.assets.map(a => `<option value="${UI.esc(a.id)}">${UI.esc(a.assetNumber)} — ${UI.esc(a.assetName)}</option>`).join('');
    if (cur) assetSel.value = cur;
  }
}

function selectAsset(id) {
  if (selectedAssetId === id) return;
  FormDirty.guard('assetForm', () => applySelectAsset(id));
}

function applySelectAsset(id) {
  selectedAssetId = id;
  const a = DB.assets.find(x => x.id === id);
  if (!a) return;
  FormDirty.clear('assetForm');
  show(document.getElementById('assetFormContent'));
  hide(document.getElementById('assetFormEmpty'));
  document.getElementById('assetFormTitle').textContent = 'Edit Asset';
  document.getElementById('assetFormSub').textContent = a.assetNumber;
  document.getElementById('assetFormBadge').textContent = 'EDIT';
  document.getElementById('assetFormBadge').className = 'form-mode-badge edit';
  populateAssetFormDropdowns();
  setVal('fAssetNumber', a.assetNumber);
  setVal('fAssetName', a.assetName);
  setVal('fAssetDesc', a.description);
  setVal('fAssetCategory', a.category);
  setVal('fAssetSubCat', a.subCategory);
  setVal('fAssetManufacturer', a.manufacturer);
  setVal('fAssetModel', a.model);
  setVal('fAssetSerial', a.serialNumber);
  setVal('fAssetTag', a.assetTag);
  setVal('fAssetStatus', a.status);
  setVal('fAssetCondition', a.condition);
  setVal('fAssetLocation', a.storageLocation);
  setVal('fAssetJob', a.jobNumber);
  setVal('fAssetAssigned', a.assignedTo);
  setVal('fAssetDept', a.department);
  setVal('fAssetPurchaseDate', a.purchaseDate || '');
  setVal('fAssetPurchaseCost', a.purchaseCost ?? '');
  setVal('fAssetCurrentValue', a.currentValue ?? '');
  setVal('fAssetWarranty', a.warrantyExpiry || '');
  setVal('fAssetInsurance', a.insuranceExpiry || '');
  setVal('fAssetLastInsp', a.lastInspectionDate || '');
  setVal('fAssetNextInsp', a.nextInspectionDue || '');
  setVal('fAssetMaintInterval', a.maintenanceIntervalDays ?? '');
  setVal('fAssetDepYears', a.depreciationYears ?? '');
  setVal('fAssetNotes', a.notes);
  show(document.getElementById('assetDeleteBtn'));
  renderAssetList();
  UI.scrollToPanel('assetFormPanel');
}

function assetForm(mode) {
  if (!assetCanEdit()) return toast('You do not have permission to add assets', 'error');
  FormDirty.guard('assetForm', () => {
    selectedAssetId = null;
    FormDirty.clear('assetForm');
    show(document.getElementById('assetFormContent'));
    hide(document.getElementById('assetFormEmpty'));
    document.getElementById('assetFormTitle').textContent = 'Add Asset';
    document.getElementById('assetFormSub').textContent = 'Register a fixed asset or equipment item';
    document.getElementById('assetFormBadge').textContent = 'NEW';
    document.getElementById('assetFormBadge').className = 'form-mode-badge add';
    populateAssetFormDropdowns();
    ['fAssetNumber','fAssetName','fAssetDesc','fAssetSubCat','fAssetManufacturer','fAssetModel','fAssetSerial','fAssetTag','fAssetDept','fAssetNotes'].forEach(id => setVal(id, ''));
    setVal('fAssetCategory', '');
    setVal('fAssetStatus', 'Active');
    setVal('fAssetCondition', 'Good');
    setVal('fAssetLocation', '');
    setVal('fAssetJob', '');
    setVal('fAssetAssigned', '');
    ['fAssetPurchaseDate','fAssetWarranty','fAssetInsurance','fAssetLastInsp','fAssetNextInsp'].forEach(id => setVal(id, ''));
    ['fAssetPurchaseCost','fAssetCurrentValue','fAssetMaintInterval','fAssetDepYears'].forEach(id => setVal(id, ''));
    hide(document.getElementById('assetDeleteBtn'));
    renderAssetList();
    UI.scrollToPanel('assetFormPanel');
    document.getElementById('fAssetNumber')?.focus();
  });
}

function assetFormClear() {
  selectedAssetId = null;
  FormDirty.clear('assetForm');
  hide(document.getElementById('assetFormContent'));
  show(document.getElementById('assetFormEmpty'));
  renderAssetList();
}

function buildAssetPayload() {
  return {
    assetNumber: val('fAssetNumber'),
    assetName: val('fAssetName'),
    description: val('fAssetDesc'),
    category: val('fAssetCategory'),
    subCategory: val('fAssetSubCat'),
    manufacturer: val('fAssetManufacturer'),
    model: val('fAssetModel'),
    serialNumber: val('fAssetSerial'),
    assetTag: val('fAssetTag'),
    status: val('fAssetStatus') || 'Active',
    condition: val('fAssetCondition'),
    storageLocation: val('fAssetLocation'),
    jobNumber: val('fAssetJob'),
    assignedTo: val('fAssetAssigned'),
    department: val('fAssetDept'),
    purchaseDate: val('fAssetPurchaseDate') || null,
    purchaseCost: parseFloat(val('fAssetPurchaseCost')) || null,
    currentValue: parseFloat(val('fAssetCurrentValue')) || null,
    warrantyExpiry: val('fAssetWarranty') || null,
    insuranceExpiry: val('fAssetInsurance') || null,
    lastInspectionDate: val('fAssetLastInsp') || null,
    nextInspectionDue: val('fAssetNextInsp') || null,
    maintenanceIntervalDays: parseInt(val('fAssetMaintInterval'), 10) || null,
    depreciationYears: parseInt(val('fAssetDepYears'), 10) || null,
    notes: val('fAssetNotes')
  };
}

async function saveAsset() {
  if (!assetCanEdit()) return toast('You do not have permission to save assets', 'error');
  UI.clearFormErrors(['fAssetNumber', 'fAssetName']);
  if (!UI.validateRequired([
    { id: 'fAssetNumber', message: 'Enter an asset number' },
    { id: 'fAssetName', message: 'Enter an asset name' }
  ])) return toast('Please fix the highlighted fields', 'error');

  const payload = buildAssetPayload();
  const btn = document.getElementById('assetSaveBtn');
  await UI.withButtonLoading(btn, 'Saving…', async () => {
    if (DB.useApi && DB._apiReady && ManageITApi.getToken()) {
      if (selectedAssetId) {
        const updated = await ManageITApi.updateAsset(selectedAssetId, payload);
        const idx = DB.assets.findIndex(a => a.id === selectedAssetId);
        if (idx >= 0) DB.assets[idx] = updated;
        toast('Asset updated', 'success');
      } else {
        const created = await ManageITApi.createAsset(payload);
        DB.assets.unshift(created);
        selectedAssetId = created.id;
        toast('Asset created', 'success');
      }
    } else {
      if (selectedAssetId) {
        const idx = DB.assets.findIndex(a => a.id === selectedAssetId);
        if (idx >= 0) DB.assets[idx] = { ...DB.assets[idx], ...payload };
        toast('Asset updated', 'success');
      } else {
        const item = { id: uid(), ...payload, createdAt: new Date().toISOString() };
        DB.assets.unshift(item);
        selectedAssetId = item.id;
        toast('Asset created', 'success');
      }
    }
    DB.logActivity(currentUser.firstName + ' ' + currentUser.lastName, 'Save Asset', 'Asset Management', `${selectedAssetId ? 'Updated' : 'Created'} ${payload.assetNumber}`);
    FormDirty.clear('assetForm');
    DB.save();
    renderAssetManagementPage();
    applySelectAsset(selectedAssetId);
  });
}

function deleteAssetConfirm() {
  if (!assetCanDelete()) return toast('You do not have permission to delete assets', 'error');
  if (!selectedAssetId) return;
  const a = DB.assets.find(x => x.id === selectedAssetId);
  UI.confirm(`Delete asset ${a?.assetNumber}?`, async () => {
    if (DB.useApi && DB._apiReady && ManageITApi.getToken()) {
      await ManageITApi.deleteAsset(selectedAssetId);
    }
    DB.assets = DB.assets.filter(x => x.id !== selectedAssetId);
    DB.assetMaintenance = DB.assetMaintenance.filter(m => m.assetId !== selectedAssetId);
    DB.logActivity(currentUser.firstName + ' ' + currentUser.lastName, 'Delete Asset', 'Asset Management', `Deleted ${a?.assetNumber}`);
    DB.save();
    assetFormClear();
    renderAssetManagementPage();
    toast('Asset deleted', 'success');
  });
}

function renderMaintList() {
  populateAssetFormDropdowns();
  const q = val('maintSearch').toLowerCase();
  let items = DB.assetMaintenance.filter(m =>
    !q || (m.assetNumber || '').toLowerCase().includes(q) ||
    (m.description || '').toLowerCase().includes(q) ||
    (m.maintenanceType || '').toLowerCase().includes(q)
  );
  const countEl = document.getElementById('maintCount');
  if (countEl) countEl.textContent = items.length + ' records';
  const list = document.getElementById('maintList');
  if (!list) return;
  if (!DB.assetMaintenance.length) {
    list.innerHTML = '<div class="list-empty"><div class="list-empty-icon" data-icon="settings" data-icon-size="40"></div><div class="list-empty-title">No maintenance records</div><div class="list-empty-detail">Schedule preventive or log corrective maintenance for assets.</div><div class="list-empty-cta"><button type="button" class="btn btn-primary btn-sm" onclick="maintForm()">+ Log Maintenance</button></div></div>';
    if (typeof hydrateIcons === 'function') hydrateIcons(list);
    return;
  }
  list.innerHTML = items.map(m => `
    <div class="list-item ${selectedMaintId === m.id ? 'selected' : ''}" onclick="selectMaint('${UI.esc(m.id)}')">
      <div class="list-item-info">
        <div class="list-item-primary">${UI.esc(m.assetNumber)} — ${UI.esc(m.maintenanceType)}</div>
        <div class="list-item-secondary">${UI.esc(m.status)} · ${m.scheduledDate ? fmtDate(m.scheduledDate) : 'No date'}${m.cost ? ' · R ' + Number(m.cost).toFixed(2) : ''}</div>
      </div>
      <span class="list-item-badge ${m.status === 'Completed' ? 'badge-active' : 'badge-user'}">${UI.esc(m.status)}</span>
    </div>
  `).join('');
}

function selectMaint(id) {
  if (selectedMaintId === id) return;
  FormDirty.guard('maintForm', () => applySelectMaint(id));
}

function applySelectMaint(id) {
  selectedMaintId = id;
  const m = DB.assetMaintenance.find(x => x.id === id);
  if (!m) return;
  FormDirty.clear('maintForm');
  show(document.getElementById('maintFormContent'));
  hide(document.getElementById('maintFormEmpty'));
  document.getElementById('maintFormTitle').textContent = 'Edit Maintenance';
  document.getElementById('maintFormSub').textContent = m.assetNumber;
  populateAssetFormDropdowns();
  setVal('fMaintAsset', m.assetId);
  setVal('fMaintType', m.maintenanceType);
  setVal('fMaintStatus', m.status);
  setVal('fMaintScheduled', m.scheduledDate || '');
  setVal('fMaintCompleted', m.completedDate || '');
  setVal('fMaintBy', m.performedBy);
  setVal('fMaintVendor', m.vendor);
  setVal('fMaintCost', m.cost ?? '');
  setVal('fMaintDesc', m.description);
  setVal('fMaintParts', m.partsUsed);
  setVal('fMaintNextDue', m.nextDueDate || '');
  setVal('fMaintNotes', m.notes);
  show(document.getElementById('maintDeleteBtn'));
  renderMaintList();
  UI.scrollToPanel('maintFormPanel');
}

function maintForm() {
  if (!assetCanEdit()) return toast('You do not have permission to log maintenance', 'error');
  FormDirty.guard('maintForm', () => {
    selectedMaintId = null;
    FormDirty.clear('maintForm');
    show(document.getElementById('maintFormContent'));
    hide(document.getElementById('maintFormEmpty'));
    document.getElementById('maintFormTitle').textContent = 'Log Maintenance';
    document.getElementById('maintFormSub').textContent = 'Record scheduled or completed work';
    populateAssetFormDropdowns();
    setVal('fMaintType', 'Preventive');
    setVal('fMaintStatus', 'Scheduled');
    ['fMaintScheduled','fMaintCompleted','fMaintNextDue'].forEach(id => setVal(id, ''));
    ['fMaintBy','fMaintVendor','fMaintDesc','fMaintParts','fMaintNotes'].forEach(id => setVal(id, ''));
    setVal('fMaintCost', '');
    if (selectedAssetId) setVal('fMaintAsset', selectedAssetId);
    hide(document.getElementById('maintDeleteBtn'));
    renderMaintList();
    UI.scrollToPanel('maintFormPanel');
  });
}

function maintFormClear() {
  selectedMaintId = null;
  FormDirty.clear('maintForm');
  hide(document.getElementById('maintFormContent'));
  show(document.getElementById('maintFormEmpty'));
  renderMaintList();
}

function buildMaintPayload() {
  const assetId = val('fMaintAsset');
  const asset = DB.assets.find(a => a.id === assetId);
  return {
    assetId,
    assetNumber: asset?.assetNumber || '',
    assetName: asset?.assetName || '',
    maintenanceType: val('fMaintType') || 'Preventive',
    status: val('fMaintStatus') || 'Scheduled',
    scheduledDate: val('fMaintScheduled') || null,
    completedDate: val('fMaintCompleted') || null,
    performedBy: val('fMaintBy'),
    vendor: val('fMaintVendor'),
    cost: parseFloat(val('fMaintCost')) || null,
    description: val('fMaintDesc'),
    partsUsed: val('fMaintParts'),
    nextDueDate: val('fMaintNextDue') || null,
    notes: val('fMaintNotes')
  };
}

async function saveMaint() {
  if (!assetCanEdit()) return toast('You do not have permission to save maintenance', 'error');
  if (!val('fMaintAsset')) return toast('Select an asset', 'error');
  const payload = buildMaintPayload();
  const btn = document.getElementById('maintSaveBtn');
  await UI.withButtonLoading(btn, 'Saving…', async () => {
    if (DB.useApi && DB._apiReady && ManageITApi.getToken()) {
      if (selectedMaintId) {
        const updated = await ManageITApi.updateAssetMaintenance(selectedMaintId, payload);
        const idx = DB.assetMaintenance.findIndex(m => m.id === selectedMaintId);
        if (idx >= 0) DB.assetMaintenance[idx] = updated;
      } else {
        const created = await ManageITApi.createAssetMaintenance(payload);
        DB.assetMaintenance.unshift(created);
        selectedMaintId = created.id;
      }
    } else {
      if (selectedMaintId) {
        const idx = DB.assetMaintenance.findIndex(m => m.id === selectedMaintId);
        if (idx >= 0) DB.assetMaintenance[idx] = { ...DB.assetMaintenance[idx], ...payload };
      } else {
        const item = { id: uid(), ...payload, createdAt: new Date().toISOString() };
        DB.assetMaintenance.unshift(item);
        selectedMaintId = item.id;
      }
    }
    if (payload.status === 'Completed') {
      const asset = DB.assets.find(a => a.id === payload.assetId);
      if (asset) {
        asset.status = asset.status === 'In Maintenance' ? 'Active' : asset.status;
        if (payload.completedDate) asset.lastInspectionDate = payload.completedDate;
        if (payload.nextDueDate) asset.nextInspectionDue = payload.nextDueDate;
      }
    }
    DB.logActivity(currentUser.firstName + ' ' + currentUser.lastName, 'Save Maintenance', 'Asset Management', `${payload.assetNumber} — ${payload.maintenanceType}`);
    FormDirty.clear('maintForm');
    DB.save();
    renderAssetStats();
    renderMaintList();
    applySelectMaint(selectedMaintId);
    toast('Maintenance saved', 'success');
  });
}

function deleteMaintConfirm() {
  if (!assetCanDelete()) return toast('You do not have permission to delete maintenance records', 'error');
  if (!selectedMaintId) return;
  UI.confirm('Delete this maintenance record?', async () => {
    if (DB.useApi && DB._apiReady && ManageITApi.getToken()) {
      await ManageITApi.deleteAssetMaintenance(selectedMaintId);
    }
    DB.assetMaintenance = DB.assetMaintenance.filter(m => m.id !== selectedMaintId);
    DB.save();
    maintFormClear();
    renderAssetStats();
    toast('Maintenance record deleted', 'success');
  });
}

function renderAssetAlerts() {
  const body = document.getElementById('assetAlertsBody');
  if (!body) return;
  const today = new Date();
  const rows = [];

  DB.assets.forEach(a => {
    const insp = daysUntil(a.nextInspectionDue);
    if (insp !== null && insp <= 30) {
      rows.push({ type: 'Inspection due', asset: a, detail: insp < 0 ? `${Math.abs(insp)} days overdue` : `Due in ${insp} days`, severity: insp < 0 ? 'danger' : 'warning' });
    }
    const warranty = daysUntil(a.warrantyExpiry);
    if (warranty !== null && warranty <= 60) {
      rows.push({ type: 'Warranty expiring', asset: a, detail: warranty < 0 ? 'Expired' : `Expires in ${warranty} days`, severity: warranty < 0 ? 'danger' : 'warning' });
    }
    if (a.status === 'In Maintenance') {
      rows.push({ type: 'In maintenance', asset: a, detail: 'Asset currently under maintenance', severity: 'info' });
    }
  });

  DB.assetMaintenance.filter(m => m.status === 'Scheduled' && m.scheduledDate).forEach(m => {
    const d = daysUntil(m.scheduledDate);
    if (d !== null && d <= 14) {
      rows.push({ type: 'Maintenance scheduled', asset: { assetNumber: m.assetNumber, assetName: m.assetName, id: m.assetId }, detail: `${m.maintenanceType} — ${d < 0 ? 'overdue' : 'in ' + d + ' days'}`, severity: d < 0 ? 'danger' : 'warning' });
    }
  });

  if (!rows.length) {
    body.innerHTML = '<tr class="table-empty"><td colspan="4"><div class="recon-empty"><div class="recon-empty-icon" data-icon="check" data-icon-size="40"></div><div class="list-empty-title">All clear</div><div class="list-empty-detail">No inspections, warranties, or maintenance items need attention right now.</div></div></td></tr>';
    if (typeof hydrateIcons === 'function') hydrateIcons(body);
    return;
  }

  rows.sort((a, b) => (a.severity === 'danger' ? 0 : 1) - (b.severity === 'danger' ? 0 : 1));
  body.innerHTML = rows.map(r => `
    <tr>
      <td><span class="list-item-badge badge-${r.severity === 'danger' ? 'inactive' : r.severity === 'warning' ? 'user' : 'active'}">${UI.esc(r.type)}</span></td>
      <td><strong>${UI.esc(r.asset.assetNumber)}</strong> — ${UI.esc(r.asset.assetName || '')}</td>
      <td>${UI.esc(r.detail)}</td>
      <td><button class="btn btn-sm btn-outline" onclick="selectAssetFromAlert('${UI.esc(r.asset.id)}')">View</button></td>
    </tr>
  `).join('');
}

function selectAssetFromAlert(id) {
  assetActiveTab = 'register';
  switchAssetTab('register');
  selectAsset(id);
}

function scheduleMaintForAsset() {
  if (!selectedAssetId) return;
  assetActiveTab = 'maintenance';
  switchAssetTab('maintenance');
  maintForm();
  setVal('fMaintAsset', selectedAssetId);
}
