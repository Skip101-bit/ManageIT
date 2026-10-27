/**
 * ManageIT UI utilities — loading states, validation, a11y, mobile nav
 */
'use strict';

const JOB_TYPE_LABELS = {
  A: 'Racking & installation',
  B: 'Service & maintenance',
  C: 'Vertical storage',
  D: 'Special projects',
  E: 'Automation',
  F: 'Internal',
  G: 'Cart & battery',
  H: 'Warehouse',
  I: 'Consulting',
  J: 'Job shop',
  K: 'Kit assembly',
  L: 'Logistics',
  M: 'Mole projects',
  N: 'New build',
  O: 'Other',
  P: 'Parts supply',
  R: 'Repair',
  W: 'Workshop'
};

const UI = {
  activityLimit: 10,
  activityExpanded: false,
  tableDensity: localStorage.getItem('manageit_table_density') || 'comfortable',
  _confirmReturnFocus: null,

  jobTypeLabel(code) {
    if (!code) return '';
    return String(code).trim().toUpperCase().charAt(0);
  },

  jobTypeDescription(code) {
    if (!code) return '';
    return JOB_TYPE_LABELS[String(code).trim().toUpperCase().charAt(0)] || '';
  },

  jobTypeOptions(selected = '') {
    return '<option value="">Select type…</option>' + JOB_TYPES.map(t =>
      `<option value="${UI.esc(t)}"${t === selected ? ' selected' : ''}>${UI.esc(t)}</option>`
    ).join('');
  },

  esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  async withButtonLoading(btn, label, fn) {
    if (!btn || btn.disabled) return;
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.classList.add('is-loading');
    btn.setAttribute('aria-busy', 'true');
    if (label) btn.innerHTML = `<span class="btn-spinner"></span> ${UI.esc(label)}`;
    try {
      return await fn();
    } finally {
      btn.disabled = false;
      btn.classList.remove('is-loading');
      btn.removeAttribute('aria-busy');
      btn.innerHTML = original;
    }
  },

  setFieldError(fieldId, message) {
    const el = document.getElementById(fieldId);
    if (!el) return;
    el.classList.add('field-error');
    el.setAttribute('aria-invalid', 'true');
    let hint = el.parentElement?.querySelector('.field-error-msg');
    if (!hint) {
      hint = document.createElement('div');
      hint.className = 'field-error-msg';
      hint.id = fieldId + '-error';
      el.parentElement?.appendChild(hint);
    }
    hint.textContent = message;
    el.setAttribute('aria-describedby', hint.id);
  },

  clearFieldError(fieldId) {
    const el = document.getElementById(fieldId);
    if (!el) return;
    el.classList.remove('field-error');
    el.removeAttribute('aria-invalid');
    el.removeAttribute('aria-describedby');
    el.parentElement?.querySelector('.field-error-msg')?.remove();
  },

  clearFormErrors(fieldIds) {
    fieldIds.forEach(id => UI.clearFieldError(id));
  },

  validateRequired(fields) {
    let ok = true;
    fields.forEach(({ id, message }) => {
      const v = document.getElementById(id)?.value?.trim();
      if (!v) {
        UI.setFieldError(id, message);
        ok = false;
      } else {
        UI.clearFieldError(id);
      }
    });
    return ok;
  },

  toastWithAction(msg, type, actionLabel, actionFn, duration = 8000) {
    const iconNames = { success: 'check', error: 'x', warning: 'warning', info: 'info' };
    const c = document.getElementById('toastContainer');
    const t = document.createElement('div');
    t.className = `toast ${type} toast-with-action`;
    t.innerHTML = `<span class="toast-icon" aria-hidden="true">${icon(iconNames[type] || 'info', 18, '')}</span><span class="toast-msg">${UI.esc(msg)}</span>`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-action-btn';
    btn.textContent = actionLabel;
    btn.onclick = () => { actionFn(); t.remove(); };
    t.appendChild(btn);
    c.appendChild(t);
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 300);
    }, duration);
  },

  formatRelativeTime(iso) {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return 'Just now';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} min ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} hr ago`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day} day${day > 1 ? 's' : ''} ago`;
    return fmtDateTime(iso);
  },

  listMessage(iconName, title, detail, actionHtml = '') {
    return `<div class="list-empty"><div class="list-empty-icon" aria-hidden="true">${icon(iconName, 40, '')}</div><div class="list-empty-title">${UI.esc(title)}</div><div class="list-empty-detail">${detail}</div>${actionHtml}</div>`;
  },

  emptyListState(iconName, entityName, addFnName, addLabel) {
    return UI.listMessage(iconName, `No ${entityName} yet`, `Get started by adding your first ${entityName.toLowerCase()}.`, `<button type="button" class="btn btn-primary btn-sm list-empty-cta" onclick="${addFnName}()">${UI.esc(addLabel)}</button>`);
  },

  noResultsState(iconName, clearFnName) {
    return UI.listMessage(iconName, 'No matches found', 'Try different search terms or clear your filters.', `<button type="button" class="btn btn-outline btn-sm list-empty-cta" onclick="${clearFnName}()">Clear filters</button>`);
  },

  scrollToPanel(panelId) {
    const el = document.getElementById(panelId);
    if (!el) return;
    if (window.matchMedia('(max-width: 900px)').matches) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  },

  updateConnectionIndicators(mode) {
    const labels = {
      connected: 'SQL Connected',
      available: 'Sign in required',
      offline: 'Offline Mode'
    };
    const titles = {
      connected: 'Connected to SQL Server',
      available: 'SQL Server is available — sign in to sync',
      offline: 'Using local browser storage'
    };
    const label = labels[mode] || labels.offline;
    const title = titles[mode] || titles.offline;

    const headerBadge = document.getElementById('apiStatusBadge');
    if (headerBadge) {
      headerBadge.className = 'api-status-badge ' + (labels[mode] ? mode : 'offline');
      headerBadge.textContent = label;
      headerBadge.title = title;
    }

    const loginBadge = document.getElementById('loginStatusBadge');
    if (loginBadge) {
      loginBadge.className = 'login-status-badge ' + (labels[mode] ? mode : 'offline');
      loginBadge.textContent = label;
      loginBadge.title = title;
    }

    const dot = document.getElementById('mobileSyncDot');
    if (dot) {
      dot.className = 'mobile-sync-dot ' + (labels[mode] ? mode : 'offline');
      dot.title = title;
    }
  },

  toggleMobileSidebar(open) {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    const btn = document.getElementById('menuToggleBtn');
    const isOpen = open ?? !sidebar?.classList.contains('open');
    sidebar?.classList.toggle('open', isOpen);
    backdrop?.classList.toggle('open', isOpen);
    btn?.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    document.body.classList.toggle('sidebar-open', isOpen);
  },

  applyTableDensity() {
    document.body.classList.toggle('table-density-compact', UI.tableDensity === 'compact');
    const toggle = document.getElementById('tableDensityToggle');
    if (toggle) toggle.textContent = UI.tableDensity === 'compact' ? 'Comfortable rows' : 'Compact rows';
  },

  toggleTableDensity() {
    UI.tableDensity = UI.tableDensity === 'compact' ? 'comfortable' : 'compact';
    localStorage.setItem('manageit_table_density', UI.tableDensity);
    UI.applyTableDensity();
  },

  showTxSuccess(panelId, html) {
    const el = document.getElementById(panelId);
    if (!el) return;
    el.style.display = 'block';
    el.className = 'tx-success-banner';
    el.innerHTML = html;
    setTimeout(() => { el.style.display = 'none'; el.innerHTML = ''; }, 6000);
  },

  setupBarcodeField(fieldId) {
    const el = document.getElementById(fieldId);
    if (!el) return;
    el.setAttribute('autocomplete', 'off');
    el.setAttribute('autocapitalize', 'off');
    el.addEventListener('focus', () => el.select());
  },

  setupModalA11y() {
    const modal = document.getElementById('confirmModal');
    if (!modal) return;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'confirmTitle');
    modal.setAttribute('aria-describedby', 'confirmMessage');

    document.addEventListener('keydown', e => {
      if (!modal.classList.contains('open')) return;
      if (e.key === 'Escape') closeConfirm();
    });
  },

  trapFocusInModal() {
    const modal = document.getElementById('confirmModal');
    if (!modal?.classList.contains('open')) return;
    const focusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    modal.onkeydown = e => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    first.focus();
  }
};

const FormDirty = {
  _dirty: {},

  mark(formId) {
    this._dirty[formId] = true;
  },

  clear(formId) {
    delete this._dirty[formId];
  },

  isDirty(formId) {
    return !!this._dirty[formId];
  },

  guard(formId, proceed) {
    if (this.isDirty(formId)) {
      UI._confirmReturnFocus = document.activeElement;
      confirm('Unsaved changes', 'You have unsaved changes. Discard them?', 'Discard', 'btn-danger', () => {
        this.clear(formId);
        proceed();
      });
    } else {
      proceed();
    }
  },

  watch(formId, fieldIds) {
    fieldIds.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => this.mark(formId));
      el.addEventListener('change', () => this.mark(formId));
    });
  }
};

window.UI = UI;
window.FormDirty = FormDirty;
window.JOB_TYPE_LABELS = JOB_TYPE_LABELS;