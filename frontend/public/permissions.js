/**
 * ManageIT RBAC — 6 roles, permission grid (matches backend PermissionService)
 */
'use strict';

const ManageITPerms = (() => {
  const ROLE_LABELS = {
    admin: 'Admin',
    stockCapturer: 'Stock Capturer',
    approver: 'Approver',
    storeManager: 'Store Manager',
    auditor: 'Auditor',
    viewer: 'Viewer',
    user: 'Viewer'
  };

  function fullRow(userMgmt, settings, stockMaster, stockLocQty, tx, adjustments, stockTake, auditAdj, reports, exports, deleteTx, assetMgmt) {
    return {
      UserManagement:       userMgmt,
      SystemSettings:       settings,
      StockNumber:          stockMaster,
      StockDescription:     stockMaster,
      StockCategory:        stockMaster,
      UnitOfMeasure:        stockMaster,
      StockLocation:        stockLocQty,
      CurrentQuantity:      stockLocQty,
      MinimumStockLevel:    stockLocQty,
      StockReceiving:       tx,
      StockIssuing:         tx,
      StockTransfer:        tx,
      StockReturns:         tx,
      StockAdjustments:     adjustments,
      StockTake:            stockTake,
      AuditAdjustments:     auditAdj,
      ViewReports:          reports,
      TransactionHistory:   reports,
      ExportReports:        exports,
      DeleteTransactions:   deleteTx,
      AssetManagement:      assetMgmt
    };
  }

  const MATRIX = {
    admin: fullRow('Full', 'Full', 'Full', 'Full', 'Full', 'Full', 'Full', 'Full', 'Full', 'Full', 'Full', 'Full'),
    stockCapturer: fullRow('None', 'None', 'CreateEdit', 'CreateEdit', 'CreateEdit', 'CreateEdit', 'CreateEdit', 'Request', 'CreateEdit', 'None', 'View', 'View'),
    approver: fullRow('None', 'None', 'View', 'View', 'View', 'View', 'Approve', 'Approve', 'Approve', 'Approve', 'View', 'View'),
    storeManager: fullRow('None', 'None', 'View', 'CreateEdit', 'CreateEdit', 'CreateEdit', 'CreateEdit', 'Request', 'CreateEdit', 'None', 'View', 'CreateEdit'),
    auditor: fullRow('View', 'None', 'View', 'View', 'View', 'View', 'View', 'View', 'Full', 'CreateEdit', 'Full', 'View'),
    viewer: fullRow('None', 'None', 'View', 'View', 'View', 'View', 'View', 'None', 'View', 'None', 'None', 'View')
  };

  let perms = {};
  let role = 'viewer';

  function normalizeRole(r) {
    if (!r) return 'viewer';
    const map = {
      Admin: 'admin', admin: 'admin',
      StockCapturer: 'stockCapturer', stockCapturer: 'stockCapturer', 'Stock Capturer': 'stockCapturer',
      Approver: 'approver', approver: 'approver',
      StoreManager: 'storeManager', storeManager: 'storeManager', 'Store Manager': 'storeManager',
      Auditor: 'auditor', auditor: 'auditor',
      Viewer: 'viewer', viewer: 'viewer', User: 'viewer', user: 'viewer'
    };
    return map[r] || r.toLowerCase();
  }

  function load(user, permissions) {
    role = normalizeRole(user?.role);
    const defaults = { ...(MATRIX[role] || MATRIX.viewer) };
    if (permissions && typeof permissions === 'object') {
      perms = { ...defaults, ...permissions };
    } else {
      perms = defaults;
    }
  }

  function level(code) {
    return perms[code] || 'None';
  }

  function rank(l) {
    return ({ Full: 5, Approve: 4, CreateEdit: 3, Request: 2, View: 1, None: 0 })[l] ?? 0;
  }

  function canView(code) {
    return rank(level(code)) >= rank('View');
  }

  function canEdit(code) {
    const l = level(code);
    return l === 'CreateEdit' || l === 'Full';
  }

  function canApprove(code) {
    const l = level(code);
    return l === 'Approve' || l === 'Full';
  }

  function canFull(code) {
    return level(code) === 'Full';
  }

  function isRequestOnly(code) {
    return level(code) === 'Request';
  }

  function canRequest(code) {
    return rank(level(code)) >= rank('Request');
  }

  function hasAnyApprovePermission() {
    return ['StockAdjustments', 'StockTake', 'AuditAdjustments', 'StockReceiving', 'StockIssuing', 'StockTransfer', 'StockReturns']
      .some(canApprove);
  }

  function getRoleLabel() {
    return ROLE_LABELS[role] || role;
  }

  function roleBadgeClass() {
    const map = {
      admin:            'badge-admin',
      stockCapturer:    'badge-user',
      approver:         'badge-active',
      storeManager:     'badge-user',
      auditor:          'badge-user',
      viewer:           'badge-inactive'
    };
    return map[role] || 'badge-user';
  }

  function applyNav() {
    document.querySelectorAll('[data-perm-any]').forEach(el => {
      const codes = (el.dataset.permAny || '').split(',').map(s => s.trim()).filter(Boolean);
      const mode = el.dataset.permMode || 'view';
      const allowed = codes.some(code => {
        if (mode === 'edit') return canEdit(code);
        if (mode === 'approve') return canApprove(code);
        if (mode === 'full') return canFull(code);
        if (mode === 'none') return level(code) === 'None';
        return canView(code);
      });
      el.style.display = allowed ? '' : 'none';
    });

    document.querySelectorAll('[data-perm]').forEach(el => {
      if (el.dataset.permAny) return;
      const code = el.dataset.perm;
      const mode = el.dataset.permMode || 'view';
      let allowed = false;
      if (mode === 'edit') allowed = canEdit(code);
      else if (mode === 'approve') allowed = canApprove(code);
      else if (mode === 'full') allowed = canFull(code);
      else if (mode === 'none') allowed = level(code) === 'None';
      else allowed = canView(code);
      el.style.display = allowed ? '' : 'none';
    });

    const approvalsNav = document.getElementById('nav-approvals-stockit');
    if (approvalsNav) approvalsNav.style.display = hasAnyApprovePermission() ? '' : 'none';

    const adminSection = document.getElementById('sidebar-admin-section');
    if (adminSection) {
      const showAdmin = canView('UserManagement') || canEdit('SystemSettings');
      adminSection.style.display = showAdmin ? '' : 'none';
    }

    const userMgmtNav = document.getElementById('nav-usermgmt');
    if (userMgmtNav) userMgmtNav.style.display = canView('UserManagement') ? '' : 'none';
  }

  function applyStockFormFields() {
    const fieldMap = {
      fStockNumber:         'StockNumber',
      fPartDesc:            'StockDescription',
      fStockCategory:       'StockCategory',
      fStorageLocation:     'StockLocation',
      fQty:                 'CurrentQuantity',
      fPartNumber:          'StockNumber',
      fSerialNumber:        'StockNumber',
      fPoNumber:            'StockNumber',
      fTrayBin:             'StockLocation',
      fStockJobNum:         'StockNumber',
      fJobCatStock:         'StockCategory'
    };
    Object.entries(fieldMap).forEach(([id, code]) => {
      const el = document.getElementById(id);
      if (!el) return;
      const editable = canEdit(code);
      el.disabled = !editable;
      el.readOnly = !editable;
      if (!editable) el.title = 'View only for your role';
    });

    const saveBtn = document.getElementById('stockSaveBtn');
    const delBtn = document.getElementById('stockDeleteBtn');
    if (saveBtn) saveBtn.style.display = canEdit('StockNumber') ? '' : 'none';
    if (delBtn) delBtn.style.display = canFull('StockNumber') ? '' : 'none';
  }

  function guardEdit(code, message) {
    if (!canEdit(code) && !isRequestOnly(code)) {
      toast(message || 'You do not have permission for this action.', 'error');
      return false;
    }
    return true;
  }

  function guardView(code, message) {
    if (!canView(code)) {
      toast(message || 'You do not have permission to view this.', 'error');
      return false;
    }
    return true;
  }

  return {
    load, level, canView, canEdit, canApprove, canFull, isRequestOnly, canRequest,
    hasAnyApprovePermission, getRoleLabel, roleBadgeClass, applyNav, applyStockFormFields,
    guardEdit, guardView, normalizeRole, ROLE_LABELS, MATRIX
  };
})();
