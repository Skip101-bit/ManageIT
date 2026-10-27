/**
 * ManageIT — Multi-count inventory audit & reconciliation workflow
 */
'use strict';

const AuditWF = (() => {
  let activeSessionId = null;
  let pendingApprovalRun = null;

  function ensureStores() {
    if (!DB.auditSessions) DB.auditSessions = [];
    if (!DB.reconHistory) DB.reconHistory = [];
    if (!DB.serialNumbers) DB.serialNumbers = [];
  }

  function persist() {
    DB.cacheLocal();
    if (typeof DB.scheduleSync === 'function') DB.scheduleSync();
  }

  function getSession(id) {
    return (DB.auditSessions || []).find(s => s.id === (id || activeSessionId));
  }

  function activeSession() {
    return getSession(activeSessionId);
  }

  function masterQty(session, stockId) {
    const item = DB.stock.find(s => s.id === stockId);
    return item ? item.quantity : (session.masterSnapshot?.[stockId] ?? 0);
  }

  function countQty(session, n, stockId) {
    const line = session.counts?.[n]?.lines?.find(l => l.stockId === stockId);
    return line?.countedQty;
  }

  function createSession() {
    ensureStores();
    const session = {
      id: uid(),
      name: 'Audit ' + new Date().toLocaleDateString(),
      createdAt: new Date().toISOString(),
      createdBy: currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'System',
      status: 'count1_in_progress',
      masterSnapshot: Object.fromEntries(DB.stock.map(s => [s.id, s.quantity])),
      counts: {
        1: { submitted: false, submittedAt: null, lines: [] },
        2: { submitted: false, submittedAt: null, lines: [] },
        3: { submitted: false, submittedAt: null, lines: [] }
      },
      reconReports: {}
    };
    session.counts[1].lines = DB.stock.filter(s => (s.quantity || 0) > 0).map(s => ({
      stockId: s.id,
      stockNumber: s.stockNumber,
      partNumber: s.partNumber || '',
      partDescription: s.partDescription,
      stockCategory: s.stockCategory,
      serialNumber: s.serialNumber || '',
      countedQty: null
    }));
    DB.auditSessions.unshift(session);
    activeSessionId = session.id;
    persist();
    return session;
  }

  function stockIdsForCount(session, countNum) {
    if (countNum === 1) return session.counts[1].lines.map(l => l.stockId);
    const prevRecon = session.reconReports[countNum - 1];
    if (!prevRecon) return [];
    return prevRecon.lines.filter(l => l.qualifiesNextCount).map(l => l.stockId);
  }

  function initCountLines(session, countNum) {
    const ids = stockIdsForCount(session, countNum);
    const prev = countNum > 1 ? session.counts[countNum - 1] : null;
    session.counts[countNum].lines = ids.map(stockId => {
      const s = DB.stock.find(x => x.id === stockId);
      const prevLine = prev?.lines?.find(l => l.stockId === stockId);
      return {
        stockId,
        stockNumber: s?.stockNumber || prevLine?.stockNumber || '',
        partNumber: s?.partNumber || prevLine?.partNumber || '',
        partDescription: s?.partDescription || prevLine?.partDescription || '',
        stockCategory: s?.stockCategory || prevLine?.stockCategory || '',
        serialNumber: s?.serialNumber || prevLine?.serialNumber || '',
        countedQty: null
      };
    });
  }

  function runRecon(session, countNum) {
    const lines = [];
    const ids = countNum === 1
      ? session.counts[1].lines.map(l => l.stockId)
      : [...new Set([
          ...stockIdsForCount(session, countNum),
          ...(session.reconReports[countNum - 1]?.lines?.filter(l => l.flagged || l.varianceMaster !== 0).map(l => l.stockId) || [])
        ])];

    ids.forEach(stockId => {
      const s = DB.stock.find(x => x.id === stockId);
      const master = masterQty(session, stockId);
      const c1 = countQty(session, 1, stockId);
      const c2 = countQty(session, 2, stockId);
      const c3 = countQty(session, 3, stockId);
      const cn = countQty(session, countNum, stockId);

      let varianceMaster = cn != null ? cn - master : null;
      let varianceC1C2 = (c1 != null && c2 != null) ? c2 - c1 : null;
      let varianceC2C3 = (c2 != null && c3 != null) ? c3 - c2 : null;
      let flagged = false;
      let flagReason = '';
      let qualifiesNextCount = false;

      if (countNum === 1) {
        qualifiesNextCount = varianceMaster !== 0 && cn != null;
        if (qualifiesNextCount) flagReason = 'Master vs Count 1 mismatch';
      } else if (countNum === 2) {
        if (c1 != null && c2 != null && c1 !== c2) {
          flagged = true;
          qualifiesNextCount = true;
          flagReason = 'Count 1 vs Count 2 differ';
        }
        if (varianceMaster !== 0 && c2 != null) {
          flagged = true;
          if (!flagReason) flagReason = 'Master vs Count 2 mismatch';
        }
      } else if (countNum === 3) {
        const allThree = c1 != null && c2 != null && c3 != null;
        const noneMatchMaster = allThree && c1 !== master && c2 !== master && c3 !== master;
        if (allThree && c1 !== c2 && c2 !== c3 && c1 !== c3) {
          flagged = true;
          flagReason = noneMatchMaster
            ? 'All three counts differ — none match master (final report)'
            : 'All three counts differ';
        } else if (allThree && c1 === c3 && c1 !== c2) {
          flagged = false;
          flagReason = 'Count 1 = Count 3 (flag cleared)';
        } else if (allThree && c2 === c3 && c1 !== c2) {
          flagged = false;
          flagReason = 'Count 2 = Count 3 (flag cleared)';
        }
        if (varianceMaster !== 0 && c3 != null) {
          flagged = true;
          if (!flagReason || flagReason.includes('flag cleared')) {
            flagReason = 'Master vs Count 3 mismatch';
          }
        }
        // Final report must include unresolved three-way conflicts that never match master
        if (noneMatchMaster && allThree && c1 !== c2 && c2 !== c3 && c1 !== c3) {
          flagged = true;
          qualifiesNextCount = false;
          if (!flagReason) flagReason = 'All three counts differ — none match master (final report)';
        }
      }

      lines.push({
        stockId,
        stockNumber: s?.stockNumber || '',
        partNumber: s?.partNumber || '',
        partDescription: s?.partDescription || '',
        masterQty: master,
        count1: c1,
        count2: c2,
        count3: c3,
        varianceMaster,
        varianceC1C2,
        varianceC2C3,
        flagged,
        flagReason,
        qualifiesNextCount,
        adjustmentQty: varianceMaster,
        adjustmentReason: '',
        approved: null,
        approver: null
      });
    });

    const run = {
      id: uid(),
      sessionId: session.id,
      countNumber: countNum,
      runAt: new Date().toISOString(),
      runBy: currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'System',
      lines,
      transactions: [],
      status: 'complete'
    };
    session.reconReports[countNum] = run;
    DB.reconHistory.unshift(run);
    session.status = `recon${countNum}_complete`;
    persist();
    return run;
  }

  function renderAuditPage() {
    ensureStores();
    const sel = document.getElementById('auditSessionSelect');
    const countSel = document.getElementById('auditCountSelect');
    if (!sel) return;

    const sessions = DB.auditSessions || [];
    sel.innerHTML = '<option value="">— Select session —</option>' +
      sessions.map(s => `<option value="${s.id}" ${s.id === activeSessionId ? 'selected' : ''}>${UI.esc(s.name)} (${s.status})</option>`).join('');

    const session = activeSession();
    let countNum = parseInt(countSel?.value || '1', 10);
    if (session) {
      if (session.counts[1].submitted && !session.counts[2].submitted) countNum = Math.max(countNum, 2);
      if (session.reconReports[1] && !session.counts[2].submitted) countNum = 2;
      if (session.counts[2].submitted && session.reconReports[2] && !session.counts[3].submitted) countNum = 3;
    }
    if (countSel) countSel.value = String(countNum);

    const banner = document.getElementById('auditWorkflowBanner');
    if (banner) {
      banner.innerHTML = session
        ? `<strong>Session:</strong> ${UI.esc(session.name)} · <strong>Count ${countNum}</strong> — enter physical quantities only. System on-hand is never shown.`
        : 'Start a new count session or select an existing session.';
    }

    const body = document.getElementById('auditCountBody');
    if (!body) return;

    if (!session) {
      body.innerHTML = '<tr class="table-empty"><td colspan="6">No active session — click <strong>Start Count 1</strong></td></tr>';
      const fixBtn = document.getElementById('auditFixCountBtn');
      if (fixBtn) fixBtn.classList.add('hidden');
      return;
    }

    if (!session.counts[countNum].lines.length && countNum > 1) {
      initCountLines(session, countNum);
      persist();
    }

    const lines = session.counts[countNum].lines;
    if (!lines.length) {
      body.innerHTML = '<tr class="table-empty"><td colspan="6">No items for this count</td></tr>';
      return;
    }

    body.innerHTML = lines.map((l, i) => `
      <tr>
        <td><strong>${UI.esc(l.stockNumber)}</strong></td>
        <td>${UI.esc(l.partNumber || '—')}</td>
        <td>${UI.esc(l.partDescription)}</td>
        <td>${UI.esc(l.stockCategory || '—')}</td>
        <td>${UI.esc(l.serialNumber || '—')}</td>
        <td><input type="number" class="form-input audit-count-input" min="0" value="${l.countedQty ?? ''}" placeholder="Count"
          ${session.counts[countNum].submitted ? 'disabled' : ''}
          onchange="AuditWF.setCountQty(${countNum}, ${i}, this.value)" /></td>
      </tr>
    `).join('');

    const submitBtn = document.getElementById('auditSubmitCountBtn');
    if (submitBtn) {
      submitBtn.textContent = `Submit Count ${countNum}`;
      submitBtn.disabled = !!session.counts[countNum].submitted;
    }
    const fixBtn = document.getElementById('auditFixCountBtn');
    if (fixBtn) {
      const canFix = !!session.counts[countNum].submitted;
      fixBtn.classList.toggle('hidden', !canFix);
      fixBtn.textContent = `Go Back to Fix Count ${countNum}`;
    }
  }

  function reconEmptyState(icon, title, detail) {
    return `<div class="recon-empty">
      <div class="recon-empty-icon" data-icon="${icon}" data-icon-size="40"></div>
      <div class="list-empty-title">${title}</div>
      <div class="list-empty-detail">${detail}</div>
    </div>`;
  }

  function updateReconWorkflowSteps(countNum, session) {
    const steps = document.querySelectorAll('#page-reconciliation .workflow-step');
    steps.forEach((el, i) => {
      const stepNum = i + 1;
      el.classList.remove('active', 'done');
      if (stepNum < countNum && session?.reconReports?.[stepNum]) {
        el.classList.add('done');
      } else if (stepNum === countNum) {
        el.classList.add('active');
      } else if (stepNum === 4 && countNum === 3 && session?.reconReports?.[3]) {
        el.classList.add('active');
      }
    });
  }

  function setReconBanner(text) {
    const info = document.getElementById('reconWorkflowInfo');
    if (!info) return;
    const textEl = info.querySelector('.workflow-banner-text');
    if (textEl) textEl.textContent = text;
    else info.textContent = text;
  }

  function renderReconPage() {
    ensureStores();
    const sessionSel = document.getElementById('reconSessionSelect');
    const countSel = document.getElementById('reconCountSelect');
    if (!sessionSel) return;

    sessionSel.innerHTML = '<option value="">— Select audit session —</option>' +
      (DB.auditSessions || []).map(s => `<option value="${s.id}" ${s.id === activeSessionId ? 'selected' : ''}>${UI.esc(s.name)}</option>`).join('');

    const session = activeSession();
    const countNum = parseInt(countSel?.value || '1', 10);
    const run = session?.reconReports?.[countNum];
    const meta = document.getElementById('reconReportMeta');

    updateReconWorkflowSteps(countNum, session);

    const approveBtn = document.getElementById('reconApproveBtn');
    if (approveBtn) {
      const showApprove = !!(session && session.reconReports?.[3]);
      approveBtn.classList.toggle('hidden', !showApprove);
    }

    if (!session) setReconBanner('Select an audit session and count, then run reconciliation.');
    else if (!session.counts[countNum]?.submitted) setReconBanner(`Count ${countNum} must be submitted before reconciliation.`);
    else if (countNum === 2 && !session.reconReports[1]) setReconBanner('Run Reconciliation for Count 1 first.');
    else if (countNum === 3 && !session.reconReports[2]) setReconBanner('Run Reconciliation for Count 2 first.');
    else if (run) setReconBanner(`Report ${countNum} generated ${fmtDateTime(run.runAt)} — ${run.lines.filter(l => l.flagged || l.varianceMaster).length} flagged / mismatch items.`);
    else setReconBanner(`Ready to run Reconciliation Report ${countNum}.`);

    if (meta) {
      if (!run) meta.textContent = '';
      else {
        const flagged = run.lines.filter(l => l.flagged || l.varianceMaster).length;
        meta.textContent = `${run.lines.length} lines · ${flagged} flagged`;
      }
    }

    const body = document.getElementById('reconcileTableBody');
    if (!body) return;

    if (!run) {
      body.innerHTML = `<tr class="table-empty"><td colspan="12">${reconEmptyState('scale', 'No report yet', 'Select a session and report, then click Run Reconciliation to compare counts against master.')}</td></tr>`;
      renderReconHistoryList();
      if (typeof hydrateIcons === 'function') hydrateIcons(document.getElementById('page-reconciliation'));
      return;
    }

    const varianceLines = run.lines.filter(l =>
      l.flagged || l.qualifiesNextCount || l.varianceMaster !== 0 ||
      (countNum >= 2 && l.varianceC1C2 !== 0) ||
      (countNum >= 3 && l.varianceC2C3 !== 0)
    );

    body.innerHTML = varianceLines.map(l => `
      <tr class="${l.flagged ? 'recon-flagged' : ''}">
        <td><strong>${UI.esc(l.stockNumber)}</strong></td>
        <td>${UI.esc(l.partNumber || '')}</td>
        <td title="${UI.esc(l.partDescription)}">${UI.esc(l.partDescription)}</td>
        <td>${l.masterQty}</td>
        <td>${l.count1 != null ? l.count1 : ''}</td>
        <td>${l.count2 != null ? l.count2 : ''}</td>
        <td>${l.count3 != null ? l.count3 : ''}</td>
        <td class="reconcile-diff ${l.varianceMaster > 0 ? 'positive' : l.varianceMaster < 0 ? 'negative' : 'zero'}">${l.varianceMaster != null ? (l.varianceMaster > 0 ? '+' : '') + l.varianceMaster : ''}</td>
        <td class="reconcile-diff ${l.varianceC1C2 > 0 ? 'positive' : l.varianceC1C2 < 0 ? 'negative' : 'zero'}">${l.varianceC1C2 != null ? (l.varianceC1C2 > 0 ? '+' : '') + l.varianceC1C2 : ''}</td>
        <td class="reconcile-diff ${l.varianceC2C3 > 0 ? 'positive' : l.varianceC2C3 < 0 ? 'negative' : 'zero'}">${l.varianceC2C3 != null ? (l.varianceC2C3 > 0 ? '+' : '') + l.varianceC2C3 : ''}</td>
        <td>${l.flagged ? `<span class="list-item-badge badge-inactive">${UI.esc(l.flagReason)}</span>` : l.qualifiesNextCount ? '<span class="list-item-badge badge-user">→ Next count</span>' : statusBadge('match', 'OK')}</td>
        <td>${countNum === 3 && (l.varianceMaster || l.flagged) ? `<button class="btn btn-sm btn-outline" onclick="navTo('transactions')">Txn</button>` : ''}</td>
      </tr>
    `).join('') || `<tr class="table-empty"><td colspan="12">${reconEmptyState('check', 'All items matched', 'No variances or flagged items in this report.')}</td></tr>`;

    renderReconHistoryList();
    if (typeof hydrateIcons === 'function') hydrateIcons(document.getElementById('page-reconciliation'));
  }

  function renderReconHistoryList() {
    const list = document.getElementById('reconHistoryList');
    const countEl = document.getElementById('reconHistoryCount');
    if (!list) return;
    const items = (DB.reconHistory || []).slice(0, 20);
    if (countEl) countEl.textContent = `${items.length} run${items.length === 1 ? '' : 's'}`;
    if (!items.length) {
      list.innerHTML = reconEmptyState('history', 'No history yet', 'Completed reconciliation runs will appear here for quick review and export.');
      if (typeof hydrateIcons === 'function') hydrateIcons(list);
      return;
    }
    list.innerHTML = items.map(r => {
      const session = getSession(r.sessionId);
      return `<div class="list-item" onclick="AuditWF.previewReport('${r.id}')">
        <div class="list-item-info">
          <div class="list-item-primary">${UI.esc(session?.name || 'Session')} — Report ${r.countNumber}</div>
          <div class="list-item-secondary">${fmtDateTime(r.runAt)} · ${r.lines.length} lines · ${UI.esc(r.runBy)}</div>
        </div>
        <button class="btn btn-sm btn-outline" onclick="event.stopPropagation();AuditWF.exportReportPdf('${r.id}')">PDF</button>
      </div>`;
    }).join('');
  }

  function previewReport(runId) {
    const run = (DB.reconHistory || []).find(r => r.id === runId);
    if (!run) return;
    const session = getSession(run.sessionId);
    const body = document.getElementById('reconReportPreviewBody');
    const title = document.getElementById('reconReportPreviewTitle');
    if (title) title.textContent = `${session?.name || 'Audit'} — Reconciliation Report ${run.countNumber}`;
    if (!body) return;

    body.innerHTML = `
      <p><strong>Run by:</strong> ${UI.esc(run.runBy)} · <strong>Date:</strong> ${fmtDateTime(run.runAt)}</p>
      <h4>Master vs Count 1</h4>
      <table class="report-mini"><thead><tr><th>Stock #</th><th>Master</th><th>Count 1</th><th>Var</th></tr></thead>
      <tbody>${run.lines.map(l => `<tr><td>${UI.esc(l.stockNumber)}</td><td>${l.masterQty}</td><td>${l.count1 ?? '—'}</td><td>${l.varianceMaster ?? '—'}</td></tr>`).join('')}</tbody></table>
      ${run.countNumber >= 2 ? `<h4>Count 1 vs Count 2</h4><table class="report-mini"><thead><tr><th>Stock #</th><th>C1</th><th>C2</th><th>Var</th><th>Flagged</th></tr></thead>
      <tbody>${run.lines.filter(l => l.count2 != null).map(l => `<tr class="${l.flagged ? 'recon-flagged' : ''}"><td>${UI.esc(l.stockNumber)}</td><td>${l.count1}</td><td>${l.count2}</td><td>${l.varianceC1C2 ?? '—'}</td><td>${l.flagged ? UI.esc(l.flagReason) : '—'}</td></tr>`).join('')}</tbody></table>` : ''}
      ${run.countNumber >= 3 ? `<h4>Count 2 vs Count 3</h4><table class="report-mini"><thead><tr><th>Stock #</th><th>C2</th><th>C3</th><th>Var</th><th>Flagged</th></tr></thead>
      <tbody>${run.lines.filter(l => l.count3 != null).map(l => `<tr class="${l.flagged ? 'recon-flagged' : ''}"><td>${UI.esc(l.stockNumber)}</td><td>${l.count2}</td><td>${l.count3}</td><td>${l.varianceC2C3 ?? '—'}</td><td>${l.flagged ? UI.esc(l.flagReason) : '—'}</td></tr>`).join('')}</tbody></table>` : ''}
      <h4>Quantity adjustments</h4>
      <table class="report-mini"><thead><tr><th>Stock #</th><th>Variance</th><th>Decision</th><th>Reason</th><th>Approver</th></tr></thead>
      <tbody>${run.lines.filter(l => l.approved != null).map(l => `<tr><td>${UI.esc(l.stockNumber)}</td><td>${l.varianceMaster ?? '—'}</td><td>${l.approved ? 'Approved' : 'Rejected'}</td><td>${UI.esc(l.adjustmentReason || '—')}</td><td>${UI.esc(l.approver || '—')}</td></tr>`).join('') || '<tr><td colspan="5">No adjustments recorded</td></tr>'}</tbody></table>
      <h4>Transactions performed</h4>
      <p>${(run.transactions || []).length ? run.transactions.map(t => UI.esc(t)).join('; ') : 'None recorded during this reconciliation run.'}</p>
    `;
    document.getElementById('reconReportModal')?.classList.add('open');
  }

  return {
    selectSession(id) {
      activeSessionId = id || null;
      renderAuditPage();
      renderReconPage();
    },

    startCount1() {
      if (!ManageITPerms.canEdit('StockTake') && !ManageITPerms.canFull('StockTake')) {
        return toast('You do not have permission to run a stock take.', 'error');
      }
      createSession();
      toast('Count 1 started — enter counted quantities (on-hand hidden)', 'success');
      DB.logActivity(currentUser.firstName + ' ' + currentUser.lastName, 'Audit', 'Inventory Audit', 'Started Count 1 session');
      renderAuditPage();
    },

    setCountQty(countNum, lineIndex, value) {
      const session = activeSession();
      if (!session || session.counts[countNum].submitted) return;
      const qty = value === '' ? null : parseInt(value, 10);
      session.counts[countNum].lines[lineIndex].countedQty = isNaN(qty) ? null : qty;
      persist();
    },

    submitCount() {
      const session = activeSession();
      if (!session) return toast('Select or start an audit session', 'error');
      const countNum = parseInt(document.getElementById('auditCountSelect')?.value || '1', 10);
      const lines = session.counts[countNum].lines;
      const missing = lines.filter(l => l.countedQty == null);
      if (missing.length) return toast(`Enter counted quantity for all ${lines.length} items (${missing.length} missing)`, 'error');

      session.counts[countNum].submitted = true;
      session.counts[countNum].submittedAt = new Date().toISOString();
      session.status = `count${countNum}_submitted`;
      DB.logActivity(currentUser.firstName + ' ' + currentUser.lastName, 'Audit', 'Inventory Audit', `Submitted Count ${countNum} (${lines.length} items)`);
      persist();
      toast(`Count ${countNum} submitted`, 'success');

      if (countNum < 3 && session.reconReports[countNum]) {
        initCountLines(session, countNum + 1);
      }
      renderAuditPage();
    },

    runReconciliation() {
      const session = activeSession();
      if (!session) return toast('Select an audit session', 'error');
      const countNum = parseInt(document.getElementById('reconCountSelect')?.value || '1', 10);

      if (!session.counts[countNum]?.submitted) {
        return toast(`Submit Count ${countNum} in Inventory Audit first`, 'error');
      }
      if (countNum === 2 && !session.reconReports[1]) {
        return toast('Run Reconciliation for Count 1 first', 'error');
      }
      if (countNum === 3 && !session.reconReports[2]) {
        return toast('Run Reconciliation for Count 2 first', 'error');
      }

      const run = runRecon(session, countNum);
      if (countNum === 1) {
        initCountLines(session, 2);
        session.status = 'count2_ready';
      } else if (countNum === 2) {
        initCountLines(session, 3);
        session.status = 'count3_ready';
      }
      persist();
      DB.logActivity(currentUser.firstName + ' ' + currentUser.lastName, 'Reconcile', 'Stock Reconciliation', `Ran Reconciliation Report ${countNum}`);
      toast(`Reconciliation Report ${countNum} complete`, 'success');
      renderReconPage();
      renderAuditPage();
    },

    openApproval() {
      const session = activeSession();
      if (!session) return toast('Select an audit session first', 'error');
      const countNum = 3;
      const run = session?.reconReports?.[countNum];
      if (!run) return toast('Run Reconciliation for Count 3 first', 'error');
      pendingApprovalRun = run;
      const mismatched = run.lines.filter(l => l.varianceMaster !== 0 || l.flagged);
      const body = document.getElementById('reconApprovalBody');
      if (!body) return;
      body.innerHTML = mismatched.map((l, i) => {
        const decided = l.approved === true ? 'Approved' : l.approved === false ? 'Rejected' : '—';
        return `
        <tr class="${l.flagged ? 'recon-flagged' : ''}">
          <td><strong>${UI.esc(l.stockNumber)}</strong></td>
          <td>${UI.esc(l.partNumber || '—')}</td>
          <td>${l.masterQty}</td>
          <td>${l.count3 ?? l.count2 ?? l.count1}</td>
          <td>${l.varianceMaster > 0 ? '+' : ''}${l.varianceMaster ?? '—'}</td>
          <td><input type="text" class="form-input" id="adjReason_${i}" maxlength="200" placeholder="Reason required…"
            value="${UI.esc(l.adjustmentReason || '')}"
            onchange="AuditWF.setAdjustmentReason(${i}, this.value)" /></td>
          <td>
            <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
              <button class="btn btn-sm btn-primary" onclick="AuditWF.approveLine(${i}, true)">Approve</button>
              <button class="btn btn-sm btn-outline" onclick="AuditWF.approveLine(${i}, false)">Reject</button>
              <span style="font-size:12px;color:var(--text-muted)">${decided}</span>
            </div>
          </td>
        </tr>`;
      }).join('') || '<tr class="table-empty"><td colspan="7">No adjustments pending</td></tr>';
      document.getElementById('reconApprovalModal')?.classList.add('open');
    },

    setAdjustmentReason(idx, value) {
      if (!pendingApprovalRun) return;
      const mismatched = pendingApprovalRun.lines.filter(l => l.varianceMaster !== 0 || l.flagged);
      const line = mismatched[idx];
      if (!line) return;
      line.adjustmentReason = String(value || '').trim();
      persist();
    },

    approveLine(idx, approved) {
      if (!pendingApprovalRun) return;
      const mismatched = pendingApprovalRun.lines.filter(l => l.varianceMaster !== 0 || l.flagged);
      const line = mismatched[idx];
      if (!line) return;
      const reasonEl = document.getElementById(`adjReason_${idx}`);
      const reason = (reasonEl?.value || line.adjustmentReason || '').trim();
      if (!reason) return toast('Enter a reason before approving or rejecting', 'error');
      line.adjustmentReason = reason;
      line.approved = approved;
      line.approver = currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'System';
      persist();
      toast(approved ? 'Adjustment approved' : 'Adjustment rejected', approved ? 'success' : 'error');
      this.openApproval();
    },

    saveApprovals() {
      if (!pendingApprovalRun) return;
      const mismatched = pendingApprovalRun.lines.filter(l => l.varianceMaster !== 0 || l.flagged);
      const undecided = mismatched.filter(l => l.approved == null);
      if (undecided.length) return toast(`Decide all ${undecided.length} remaining variance line(s) first`, 'error');
      const missingReason = mismatched.filter(l => !(l.adjustmentReason || '').trim());
      if (missingReason.length) return toast('Every adjustment needs a reason', 'error');

      const approved = pendingApprovalRun.lines.filter(l => l.approved === true);
      approved.forEach(l => {
        const item = DB.stock.find(s => s.id === l.stockId);
        if (item && l.varianceMaster != null) {
          item.quantity = l.count3 ?? l.count2 ?? l.count1 ?? item.quantity;
        }
      });
      if (isApiMode()) {
        Promise.all(approved.map(async l => {
          const item = DB.stock.find(s => s.id === l.stockId);
          if (item) await persistStockItem(item, false);
        })).then(() => DB.cacheLocal());
      } else DB.save();
      pendingApprovalRun.status = 'approved';
      document.getElementById('reconApprovalModal')?.classList.remove('open');
      toast('Adjustments saved', 'success');
      DB.logActivity(currentUser.firstName + ' ' + currentUser.lastName, 'Reconcile', 'Stock Reconciliation', `Saved ${approved.length} approved adjustments`);
      renderReconPage();
    },

    getCountSheetRows() {
      const session = activeSession();
      if (!session) return null;
      const countNum = parseInt(document.getElementById('auditCountSelect')?.value || '1', 10);
      if (!session.counts[countNum]?.lines?.length && countNum > 1) {
        initCountLines(session, countNum);
        persist();
      }
      const lines = session.counts[countNum]?.lines || [];
      if (!lines.length) return null;
      return lines.map(l => {
        const s = DB.stock.find(x => x.id === l.stockId);
        return {
          stockNumber: l.stockNumber || s?.stockNumber || '',
          partNumber: l.partNumber || s?.partNumber || '',
          partDescription: l.partDescription || s?.partDescription || '',
          stockCategory: l.stockCategory || s?.stockCategory || '',
          storageLocation: s?.storageLocation || '',
          trayBin: s?.trayBin || '',
          countedQty: l.countedQty ?? ''
        };
      });
    },

    fixCount() {
      const session = activeSession();
      if (!session) return toast('Select an audit session', 'error');
      const countNum = parseInt(document.getElementById('auditCountSelect')?.value || '1', 10);
      if (!session.counts[countNum]?.submitted) {
        return toast(`Count ${countNum} is not submitted yet`, 'error');
      }
      if (!confirm(`Re-open Count ${countNum} for editing? Later counts and reconciliation reports from this point will be cleared.`)) {
        return;
      }

      session.counts[countNum].submitted = false;
      session.counts[countNum].submittedAt = null;
      for (let n = countNum; n <= 3; n++) {
        delete session.reconReports[n];
      }
      for (let n = countNum + 1; n <= 3; n++) {
        session.counts[n] = { submitted: false, submittedAt: null, lines: [] };
      }
      DB.reconHistory = (DB.reconHistory || []).filter(r =>
        !(r.sessionId === session.id && r.countNumber >= countNum)
      );
      session.status = `count${countNum}_in_progress`;
      persist();
      DB.logActivity(currentUser.firstName + ' ' + currentUser.lastName, 'Audit', 'Inventory Audit', `Re-opened Count ${countNum} for corrections`);
      toast(`Count ${countNum} re-opened — fix quantities then submit again`, 'success');
      renderAuditPage();
      renderReconPage();
    },

    importCountSheet() {
      const session = activeSession();
      if (!session) return toast('Select or start an audit session first', 'error');
      const countNum = parseInt(document.getElementById('auditCountSelect')?.value || '1', 10);
      if (session.counts[countNum]?.submitted) {
        return toast(`Count ${countNum} is already submitted — use Go Back to Fix Count first`, 'error');
      }
      if (!session.counts[countNum]?.lines?.length && countNum > 1) {
        initCountLines(session, countNum);
        persist();
      }
      if (!(session.counts[countNum]?.lines || []).length) {
        return toast('No count lines available for this session', 'error');
      }
      const input = document.getElementById('auditCountSheetInput');
      if (!input) return toast('Import control not found', 'error');
      input.value = '';
      input.click();
    },

    handleCountSheetFile(input) {
      const file = input?.files?.[0];
      if (!file) return;
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          let rows = [];
          if (ext === 'csv' || ext === 'txt' || ext === 'tsv') {
            const workbook = XLSX.read(e.target.result, { type: 'string', FS: ext === 'tsv' ? '\t' : undefined });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            rows = (typeof parseSpreadsheetSheet === 'function'
              ? parseSpreadsheetSheet(sheet)
              : { rows: XLSX.utils.sheet_to_json(sheet) }).rows;
          } else {
            const workbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            rows = (typeof parseSpreadsheetSheet === 'function'
              ? parseSpreadsheetSheet(sheet)
              : { rows: XLSX.utils.sheet_to_json(sheet) }).rows;
          }
          this.applyCountSheetImport(rows, file.name);
        } catch (err) {
          toast('Failed to read count sheet: ' + err.message, 'error');
        }
      };
      if (ext === 'csv' || ext === 'txt' || ext === 'tsv') reader.readAsText(file);
      else reader.readAsArrayBuffer(file);
    },

    applyCountSheetImport(rows, fileName) {
      const session = activeSession();
      if (!session) return toast('Select an audit session first', 'error');
      const countNum = parseInt(document.getElementById('auditCountSelect')?.value || '1', 10);
      if (session.counts[countNum]?.submitted) {
        return toast(`Count ${countNum} is already submitted`, 'error');
      }
      if (!session.counts[countNum]?.lines?.length && countNum > 1) {
        initCountLines(session, countNum);
      }
      const lines = session.counts[countNum].lines || [];
      if (!lines.length) return toast('No count lines to import into', 'error');
      if (!rows?.length) return toast('Count sheet has no data rows', 'error');

      const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const headers = Object.keys(rows[0] || {});
      const stockHeader = headers.find(h => {
        const n = norm(h);
        return ['inventorynumber', 'stocknumber', 'stockno', 'stock', 'code', 'itemnumber', 'itemcode'].includes(n)
          || n.includes('inventorynumber') || n.includes('stocknumber');
      });
      const qtyHeader = headers.find(h => {
        const n = norm(h);
        return ['countedqty', 'countedquantity', 'countqty', 'qty', 'quantity', 'physicalqty', 'physicalcount'].includes(n)
          || n.includes('counted');
      });
      if (!stockHeader) return toast('Could not find Inventory Number / Stock # column', 'error');
      if (!qtyHeader) return toast('Could not find Counted Qty column', 'error');

      const sheetByStock = new Map();
      rows.forEach((row, i) => {
        const key = String(row[stockHeader] ?? '').trim();
        if (!key) return;
        const rawQty = row[qtyHeader];
        const blank = rawQty === '' || rawQty == null
          || /^[-–—−]+$/.test(String(rawQty).trim())
          || /^(n\/?a|null|none|blank)$/i.test(String(rawQty).trim());
        const parsed = blank
          ? { ok: false, value: null }
          : (typeof importNormalizeNumber === 'function'
            ? importNormalizeNumber(rawQty)
            : { ok: !isNaN(parseFloat(rawQty)), value: parseFloat(rawQty) });
        sheetByStock.set(key.toLowerCase(), {
          rowNum: i + 2,
          stockNumber: key,
          qty: parsed.ok && parsed.value != null ? Math.round(parsed.value) : null,
          qtyRaw: blank ? '—' : rawQty,
          qtyOk: !!(parsed.ok && parsed.value != null && parsed.value >= 0),
          blank
        });
      });

      const results = lines.map(line => {
        const key = String(line.stockNumber || '').trim().toLowerCase();
        const match = sheetByStock.get(key);
        if (!match) {
          return {
            stockNumber: line.stockNumber,
            partNumber: line.partNumber || '',
            partDescription: line.partDescription || '',
            sheetQty: '',
            status: 'missing',
            detail: 'Not found on sheet'
          };
        }
        if (!match.qtyOk) {
          return {
            stockNumber: line.stockNumber,
            partNumber: line.partNumber || '',
            partDescription: line.partDescription || '',
            sheetQty: match.qtyRaw,
            status: 'invalid',
            detail: match.blank ? 'Blank / dash — enter a number' : 'Invalid quantity'
          };
        }
        line.countedQty = match.qty;
        sheetByStock.delete(key);
        return {
          stockNumber: line.stockNumber,
          partNumber: line.partNumber || '',
          partDescription: line.partDescription || '',
          sheetQty: match.qty,
          status: 'ok',
          detail: 'Imported'
        };
      });

      const extras = [...sheetByStock.values()].map(m => ({
        stockNumber: m.stockNumber,
        partNumber: '',
        partDescription: '',
        sheetQty: m.qtyOk ? m.qty : m.qtyRaw,
        status: 'extra',
        detail: 'On sheet but not in this count'
      }));

      persist();

      const ok = results.filter(r => r.status === 'ok').length;
      const missing = results.filter(r => r.status === 'missing').length;
      const invalid = results.filter(r => r.status === 'invalid').length;
      const allResults = [...results, ...extras];

      const summary = document.getElementById('countImportSummary');
      if (summary) {
        summary.textContent = `${fileName || 'Sheet'}: ${ok} imported · ${missing} missing · ${invalid} invalid · ${extras.length} extra — check every line below.`;
      }
      const body = document.getElementById('countImportBody');
      if (body) {
        body.innerHTML = allResults.map(r => {
          const badge = r.status === 'ok'
            ? '<span class="list-item-badge badge-active">Imported</span>'
            : r.status === 'missing'
              ? '<span class="list-item-badge badge-inactive">Missing</span>'
              : r.status === 'invalid'
                ? '<span class="list-item-badge badge-inactive">Invalid qty</span>'
                : '<span class="list-item-badge badge-user">Extra</span>';
          return `<tr class="${r.status !== 'ok' ? 'recon-flagged' : ''}">
            <td><strong>${UI.esc(r.stockNumber)}</strong></td>
            <td>${UI.esc(r.partNumber || '—')}</td>
            <td>${UI.esc(r.partDescription || '—')}</td>
            <td>${r.sheetQty === '' || r.sheetQty == null ? '—' : UI.esc(String(r.sheetQty))}</td>
            <td>${badge} <span style="font-size:12px;color:var(--text-muted)">${UI.esc(r.detail)}</span></td>
          </tr>`;
        }).join('');
      }
      document.getElementById('countImportModal')?.classList.add('open');
      DB.logActivity(currentUser.firstName + ' ' + currentUser.lastName, 'Audit', 'Inventory Audit', `Imported count sheet for Count ${countNum}: ${ok}/${lines.length} lines`);
      if (missing || invalid) toast(`Import partial — ${ok} ok, ${missing} missing, ${invalid} invalid`, 'warning');
      else toast(`Import complete — all ${ok} count lines imported`, 'success');
      renderAuditPage();
    },

    closeModal(id) {
      document.getElementById(id)?.classList.remove('open');
    },

    previewReport,
    exportReportPdf(runId) {
      previewReport(runId);
      toast('Use browser Print → Save as PDF on the preview', 'success');
    },

    renderAuditPage,
    renderReconPage
  };
})();

window.AuditWF = AuditWF;

function navFromHome(pageId, menuKey) {
  if (menuKey === 'stockit') enterPortal('stockit', pageId);
  else if (menuKey === 'admin') enterPortal('admin', pageId);
  else if (menuKey === 'reports') enterPortal('reports', pageId);
  else navTo(pageId);
}

function toggleHomeSection(el) {
  const section = el.closest('.home-section');
  if (section) section.classList.toggle('collapsed');
}

function getSerialOptions() {
  const set = new Set();
  DB.stock.forEach(s => { if (s.serialNumber) set.add(s.serialNumber.trim()); });
  (DB.serialNumbers || []).forEach(sn => { if (sn) set.add(sn.trim()); });
  return [...set].filter(Boolean).sort();
}

function refreshSerialSelect(selectId, currentValue) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const opts = getSerialOptions();
  const cur = currentValue ?? sel.value;
  sel.innerHTML = '<option value="">Select serial…</option>' +
    opts.map(o => `<option value="${UI.esc(o)}" ${o === cur ? 'selected' : ''}>${UI.esc(o)}</option>`).join('') +
    '<option value="__add_new__">+ Add new serial…</option>';
}

function onSerialSelect(selectId, newInputId) {
  const sel = document.getElementById(selectId);
  const inp = document.getElementById(newInputId);
  const wrap = inp?.closest('.serial-add-row');
  if (!sel) return;
  if (sel.value === '__add_new__') {
    if (wrap) wrap.classList.remove('hidden');
    else if (inp) inp.classList.remove('hidden');
    if (inp) inp.focus();
    sel.value = '';
  } else {
    if (wrap) wrap.classList.add('hidden');
    else if (inp) inp.classList.add('hidden');
    if (inp) inp.value = '';
  }
}

function addSerialNumber(selectId, newInputId) {
  if (!DB.serialNumbers) DB.serialNumbers = [];
  const inp = document.getElementById(newInputId);
  const val = (inp?.value || '').trim();
  if (!val) return toast('Enter a serial number', 'error');
  if (!DB.serialNumbers.includes(val)) DB.serialNumbers.push(val);
  DB.cacheLocal();
  refreshSerialSelect(selectId, val);
  document.getElementById(selectId).value = val;
  const wrap = inp?.closest('.serial-add-row');
  if (wrap) wrap.classList.add('hidden');
  else if (inp) inp.classList.add('hidden');
  if (inp) { inp.value = ''; }
  toast('Serial number added', 'success');
}

function initSerialDropdowns() {
  ['biFSerial', 'trFSerial'].forEach(id => refreshSerialSelect(id));
}

