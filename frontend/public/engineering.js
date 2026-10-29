/* =============================================
   ManageIT — BOM, stock check, Pastel alignment
============================================= */
'use strict';

const Engineering = {
  bomFilter: { q: '', source: '', discipline: '' },
  pastelFilter: '',

  ensure() {
    if (!Array.isArray(DB.bomLines)) DB.bomLines = [];
    if (!Array.isArray(DB.pastelChecks)) DB.pastelChecks = [];
    if (!Array.isArray(DB.pastelUpdates)) DB.pastelUpdates = [];
    if (!Array.isArray(DB.jobCardLines)) DB.jobCardLines = [];
    if (!Array.isArray(DB.stockChecks)) DB.stockChecks = [];
    if (!Array.isArray(DB.bomHistory)) DB.bomHistory = [];
    if (!Array.isArray(DB.pastelTimeline) || !DB.pastelTimeline.length) {
      DB.pastelTimeline = [
        { id: 'export', order: 1, title: 'Export Pastel stock', owner: 'Me', status: 'Pending', dueDate: '', notes: '' },
        { id: 'check', order: 2, title: 'Check Pastel stock against the Parts Library', owner: 'Me', status: 'Pending', dueDate: '', notes: '' },
        { id: 'mine', order: 3, title: 'Clear my outstanding part updates', owner: 'Me', status: 'Pending', dueDate: '', notes: '' },
        { id: 'carl', order: 4, title: "Clear Carl Henry's outstanding part updates", owner: 'Carl Henry', status: 'Pending', dueDate: '', notes: '' },
        { id: 'agree', order: 5, title: 'Agree the Parts Library and Pastel match', owner: 'Me & Carl Henry', status: 'Pending', dueDate: '', notes: '' },
        { id: 'final', order: 6, title: 'Final Pastel update', owner: 'Me', status: 'Pending', dueDate: '', notes: '' }
      ];
      if (typeof DB.save === 'function') DB.save();
    }
  },

  isCI(discipline) {
    const d = String(discipline || '').toLowerCase().replace(/[^a-z&]/g, '');
    return d === 'c&i' || d === 'ci' || d.includes('c&i') || d.includes('controlandinstrumentation');
  },

  applyPnRule(line) {
    const ci = this.isCI(line.discipline);
    if (line.source === 'AutoCAD') {
      line.exportedBy = 'AutoCAD';
      if (ci) {
        line.pnUpdateLocation = 'Parts Library';
        line.pnUpdateReason = 'C&I part numbers are updated in the Parts Library. AutoCAD only references this number.';
      } else {
        line.pnUpdateLocation = 'AutoCAD';
        line.pnUpdateReason = 'Exported from AutoCAD, so the part number is updated in AutoCAD.';
      }
    } else {
      line.source = 'Parts Library';
      line.exportedBy = 'Parts Library';
      line.pnUpdateLocation = 'Parts Library';
      line.pnUpdateReason = ci
        ? 'C&I part numbers are updated in the Parts Library.'
        : 'Exported from the Parts Library, so the part number is updated in the Parts Library.';
    }
    return line;
  },

  norm(value) {
    return String(value || '').trim().toUpperCase();
  },

  num(value) {
    const n = Number(String(value ?? '').replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : 0;
  },

  badge(status) {
    const s = String(status || '');
    const kind = /not on master|short|only|open|differ/i.test(s) ? 'status-shortage'
      : /on master|match|covered|done|agreed/i.test(s) ? 'status-match'
      : 'status-surplus';
    return `<span class="status-badge ${kind}">${UI.esc(s)}</span>`;
  },

  jobChoices() {
    const set = new Set();
    (DB.jobs || []).forEach(j => { if (j.jobNumber) set.add(j.jobNumber); });
    (DB.bomLines || []).forEach(l => { if (l.jobNumber) set.add(l.jobNumber); });
    return [...set].sort();
  },

  async readSheet(file) {
    if (!window.XLSX) throw new Error('Spreadsheet reader is not loaded');
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { defval: '' });
  },

  pick(row, names) {
    const keys = Object.keys(row);
    for (const name of names) {
      const hit = keys.find(k => k.trim().toLowerCase().replace(/[^a-z0-9]+/g, '') === name);
      if (hit != null && String(row[hit]).trim() !== '') return String(row[hit]).trim();
    }
    return '';
  },

  sourceFromText(value) {
    const s = String(value || '').toLowerCase();
    if (!s) return '';
    if (s.includes('auto') || s.includes('cad') || s.includes('dwg')) return 'AutoCAD';
    if (s.includes('lib') || s.includes('part')) return 'Parts Library';
    return '';
  },

  disciplineFromText(value) {
    return this.isCI(value) ? 'C&I' : 'Other';
  },

  /* ---------- BOM + stock check ---------- */

  assignJob() {
    const el = document.getElementById('bomAssignJob');
    return el ? el.value.trim() : '';
  },

  categoryFilter() {
    const el = document.getElementById('bomCatFilter');
    return el ? el.value : '';
  },

  requireJob() {
    const job = this.assignJob();
    if (!job) { toast('Enter the job number for this BOM.', 'error'); return ''; }
    if (!(DB.jobs || []).some(j => j.jobNumber === job)) {
      toast('That job number is not on Job Management.', 'error');
      return '';
    }
    return job;
  },

  fillJobDatalist() {
    const list = document.getElementById('bomJobList');
    if (!list) return;
    list.innerHTML = this.jobChoices().map(j => `<option value="${UI.esc(j)}"></option>`).join('');
  },

  masterItems(partNumber) {
    const key = this.norm(partNumber);
    const cat = this.categoryFilter();
    return (DB.stock || []).filter(s => {
      if (this.norm(s.partNumber) !== key) return false;
      if (!cat) return true;
      return (typeof normaliseStockCategory === 'function' ? normaliseStockCategory(s.stockCategory) : s.stockCategory) === cat;
    });
  },

  freeItems(partNumber) {
    return this.masterItems(partNumber).filter(s => !String(s.jobNumber || '').trim());
  },

  freeQty(partNumber) {
    return this.freeItems(partNumber).reduce((sum, s) => sum + this.num(s.quantity), 0);
  },

  onMaster(partNumber) {
    return this.masterItems(partNumber).length > 0;
  },

  qtyById() {
    const map = {};
    (DB.stock || []).forEach(s => { map[s.id] = this.num(s.quantity); });
    return map;
  },

  nextStockNumber() {
    let max = 0;
    (DB.stock || []).forEach(s => {
      const match = String(s.stockNumber || '').match(/(\d+)\s*$/);
      if (match) max = Math.max(max, parseInt(match[1], 10));
    });
    let number = '';
    do {
      max += 1;
      number = 'STK-' + String(max).padStart(3, '0');
    } while ((DB.stock || []).some(s => s.stockNumber === number));
    return number;
  },

  addHistory(type, jobNumber, summary, lines) {
    this.ensure();
    DB.bomHistory.push({
      id: uid(),
      at: new Date().toISOString(),
      jobNumber: jobNumber || '',
      type,
      summary,
      lines: lines || []
    });
    this.activeHistoryId = DB.bomHistory[DB.bomHistory.length - 1].id;
  },

  jobLines() {
    const job = this.assignJob();
    return DB.bomLines.filter(l => !job || l.jobNumber === job);
  },

  renderBom() {
    this.ensure();
    this.fillJobDatalist();
    let cleaned = false;
    DB.bomLines.forEach(l => {
      const text = `${l.exportedBy || ''} ${l.pnUpdateReason || ''}`;
      if (/ziggi|joost/i.test(text)) {
        this.applyPnRule(l);
        cleaned = true;
      }
    });
    if (cleaned) DB.save();
    const lines = this.jobLines();
    const known = lines.filter(l => this.onMaster(l.partNumber)).length;
    const unknown = lines.length - known;
    const kpis = document.getElementById('bomKpis');
    if (kpis) {
      kpis.innerHTML = [
        ['On master', known],
        ['Not on master', unknown],
        ['BOM lines', lines.length]
      ].map(([label, n]) => `<div class="eng-kpi"><strong>${n}</strong><span>${UI.esc(label)}</span></div>`).join('');
    }
    const body = document.getElementById('bomTableBody');
    if (body) {
      if (!lines.length) {
        body.innerHTML = '<tr class="table-empty"><td colspan="6">Upload a BOM for the job number above.</td></tr>';
      } else {
        body.innerHTML = lines.map(l => {
          const knownLine = this.onMaster(l.partNumber);
          const status = knownLine ? 'On master' : 'Not on master';
          const action = knownLine
            ? ''
            : `<button type="button" class="btn btn-outline btn-sm" onclick="Engineering.addUnidentified('${UI.esc(l.id)}')">Add to master</button>`;
          return `<tr>
            <td>${UI.esc(l.partNumber)}</td>
            <td>${UI.esc(l.description || '—')}</td>
            <td>${UI.esc(l.qty)}</td>
            <td>${knownLine ? UI.esc(this.freeQty(l.partNumber)) : '—'}</td>
            <td>${this.badge(status)}</td>
            <td>${action}</td>
          </tr>`;
        }).join('');
      }
    }
    this.renderHistory();
  },

  async importBom(file) {
    if (!file) return;
    this.ensure();
    const job = this.requireJob();
    const input = document.getElementById('bomImportFile');
    if (!job) { if (input) input.value = ''; return; }
    const before = this.qtyById();
    try {
      const rows = await this.readSheet(file);
      const source = document.getElementById('bomSource') ? document.getElementById('bomSource').value : '';
      const discipline = document.getElementById('bomDiscipline') ? document.getElementById('bomDiscipline').value : 'Other';
      const imported = [];
      let skipped = 0;
      rows.forEach(row => {
        const partNumber = this.pick(row, ['partnumber', 'partno', 'pn', 'code', 'itemcode', 'stockcode']);
        if (!partNumber) { skipped++; return; }
        const fileSource = this.sourceFromText(this.pick(row, ['source', 'exportedfrom', 'exportsource', 'origin', 'from'])) || source;
        const line = {
          id: uid(),
          jobNumber: job,
          partNumber,
          description: this.pick(row, ['description', 'partdescription', 'desc', 'name']),
          qty: this.num(this.pick(row, ['qty', 'quantity', 'bomqty'])),
          discipline: this.disciplineFromText(this.pick(row, ['discipline', 'category', 'type', 'group']) || discipline),
          source: fileSource,
          importedAt: new Date().toISOString()
        };
        if (fileSource) this.applyPnRule(line);
        imported.push(line);
      });
      if (!imported.length) {
        toast('No part numbers were found in that file.', 'error');
        return;
      }
      DB.bomLines = DB.bomLines.filter(l => l.jobNumber !== job).concat(imported);
      const unknown = imported.filter(l => !this.onMaster(l.partNumber)).length;
      this.addHistory('BOM uploaded', job, `${imported.length} parts assigned to ${job}. ${unknown} ${unknown === 1 ? 'is' : 'are'} not on the master. Master quantities were not changed.`, []);
      const changed = Object.keys(before).some(id => {
        const item = DB.stock.find(s => s.id === id);
        return !item || this.num(item.quantity) !== before[id];
      });
      if (changed) throw new Error('Master quantities changed during upload');
      DB.save();
      toast(`BOM uploaded for ${job}. ${unknown ? unknown + ' part' + (unknown === 1 ? ' is' : 's are') + ' not on the master.' : 'Every part is on the master.'}`, unknown ? 'info' : 'success');
      this.renderBom();
    } catch (err) {
      toast('Could not read that file. ' + err.message, 'error');
    } finally {
      if (input) input.value = '';
    }
  },

  addUnidentified(id) {
    this.ensure();
    const line = DB.bomLines.find(l => l.id === id);
    if (!line) return;
    if (this.onMaster(line.partNumber)) {
      toast(line.partNumber + ' is already on the master.', 'info');
      this.renderBom();
      return;
    }
    const before = this.qtyById();
    const cat = this.categoryFilter() || 'Production Inventory';
    DB.stock.push({
      id: uid(),
      stockNumber: this.nextStockNumber(),
      partNumber: line.partNumber,
      partDescription: line.description || line.partNumber,
      serialNumber: '',
      quantity: 0,
      stockCategory: cat,
      storageLocation: '',
      trayBin: '',
      poNumber: '',
      jobNumber: '',
      jobCategory: '',
      createdAt: new Date().toISOString()
    });
    const changed = Object.keys(before).some(stockId => {
      const item = DB.stock.find(s => s.id === stockId);
      return !item || this.num(item.quantity) !== before[stockId];
    });
    if (changed) {
      DB.stock = DB.stock.filter(s => before[s.id] !== undefined);
      toast('The master quantities were left unchanged.', 'error');
      return;
    }
    this.addHistory('Added to master', line.jobNumber, `${line.partNumber} was added to the master inventory at quantity 0.`, []);
    DB.save();
    toast(line.partNumber + ' added to the master at quantity 0.', 'success');
    this.renderBom();
  },

  addAllUnidentified() {
    this.ensure();
    const job = this.requireJob();
    if (!job) return;
    const missing = this.jobLines().filter(l => !this.onMaster(l.partNumber));
    const seen = new Set();
    const unique = missing.filter(l => {
      const key = this.norm(l.partNumber);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (!unique.length) { toast('Every BOM part for this job is already on the master.', 'info'); return; }
    const before = this.qtyById();
    const cat = this.categoryFilter() || 'Production Inventory';
    unique.forEach(line => {
      DB.stock.push({
        id: uid(),
        stockNumber: this.nextStockNumber(),
        partNumber: line.partNumber,
        partDescription: line.description || line.partNumber,
        serialNumber: '',
        quantity: 0,
        stockCategory: cat,
        storageLocation: '',
        trayBin: '',
        poNumber: '',
        jobNumber: '',
        jobCategory: '',
        createdAt: new Date().toISOString()
      });
    });
    const changed = Object.keys(before).some(stockId => {
      const item = DB.stock.find(s => s.id === stockId);
      return !item || this.num(item.quantity) !== before[stockId];
    });
    if (changed) {
      DB.stock = DB.stock.filter(s => before[s.id] !== undefined);
      toast('The master quantities were left unchanged.', 'error');
      return;
    }
    this.addHistory('Added to master', job, unique.map(l => l.partNumber).join(', ') + ' added to the master inventory at quantity 0.', []);
    DB.save();
    toast(`${unique.length} part${unique.length === 1 ? '' : 's'} added to the master at quantity 0.`, 'success');
    this.renderBom();
  },

  runBomStockCheck() {
    this.ensure();
    const job = this.requireJob();
    if (!job) return;
    const lines = DB.bomLines.filter(l => l.jobNumber === job && this.num(l.qty) > 0);
    if (!lines.length) { toast('Upload a BOM with quantities for this job first.', 'error'); return; }
    const unknown = lines.filter(l => !this.onMaster(l.partNumber));
    const checked = lines.filter(l => this.onMaster(l.partNumber)).map(l => {
      const free = this.freeQty(l.partNumber);
      const bomQty = this.num(l.qty);
      let status = 'Covered';
      if (free < bomQty) status = 'Short';
      else if (free > bomQty) status = 'Over';
      return {
        partNumber: l.partNumber,
        description: l.description || '',
        bomQty,
        freeQty: free,
        shortBy: Math.max(0, bomQty - free),
        status
      };
    });
    if (!checked.length) {
      toast('None of these parts are on the master yet. Add the unidentified parts before the stock check.', 'error');
      return;
    }
    const short = checked.filter(l => l.status === 'Short').length;
    this.addHistory('Stock check', job, `${checked.length} parts checked against free stock. ${short} short.${unknown.length ? ' ' + unknown.length + ' not on the master were left out.' : ''}`, checked);
    DB.save();
    toast(short ? `Stock check saved. ${short} part${short === 1 ? '' : 's'} short.` : 'Stock check saved. Free stock covers the BOM.', short ? 'info' : 'success');
    this.renderBom();
  },

  promptAllocate() {
    const job = this.requireJob();
    if (!job) return;
    const lines = DB.bomLines.filter(l => l.jobNumber === job && this.onMaster(l.partNumber) && this.num(l.qty) > 0);
    if (!lines.length) { toast('There are no master parts on this BOM to allocate.', 'error'); return; }
    confirm(
      'Allocate free stock',
      `Allocate free stock to ${job}? Stock already on a job is left alone. This does not create an order transaction and does not change the total quantity.`,
      'Allocate',
      'btn-primary',
      () => this.allocateToJob(job, lines)
    );
  },

  allocateToJob(job, lines) {
    const snapshot = (DB.stock || []).map(s => ({ ...s }));
    const beforeTotal = {};
    lines.forEach(l => {
      const key = this.norm(l.partNumber);
      beforeTotal[key] = this.masterItems(l.partNumber).reduce((sum, s) => sum + this.num(s.quantity), 0);
    });
    let allocatedParts = 0;
    lines.forEach(line => {
      let left = this.num(line.qty);
      const items = this.freeItems(line.partNumber).slice();
      let took = 0;
      items.forEach(item => {
        if (left <= 0) return;
        const qty = this.num(item.quantity);
        if (qty <= 0) return;
        if (qty <= left) {
          item.jobNumber = job;
          item.jobCategory = item.stockCategory || '';
          left -= qty;
          took += qty;
        } else {
          item.quantity = qty - left;
          DB.stock.push({
            id: uid(),
            stockNumber: this.nextStockNumber(),
            partNumber: item.partNumber,
            partDescription: item.partDescription,
            serialNumber: '',
            quantity: left,
            stockCategory: item.stockCategory,
            storageLocation: item.storageLocation || '',
            trayBin: item.trayBin || '',
            poNumber: item.poNumber || '',
            jobNumber: job,
            jobCategory: item.stockCategory || '',
            createdAt: new Date().toISOString()
          });
          took += left;
          left = 0;
        }
      });
      if (took > 0) allocatedParts++;
    });
    const totalsChanged = lines.some(l => {
      const now = this.masterItems(l.partNumber).reduce((sum, s) => sum + this.num(s.quantity), 0);
      return now !== beforeTotal[this.norm(l.partNumber)];
    });
    if (totalsChanged) {
      DB.stock = snapshot;
      toast('Allocation stopped because a master quantity would have changed.', 'error');
      return;
    }
    if (!allocatedParts) { toast('No free stock was available to allocate.', 'info'); return; }
    this.addHistory('Allocated to job', job, `Free stock for ${allocatedParts} part${allocatedParts === 1 ? '' : 's'} was allocated to ${job}. No order transaction was created.`, []);
    DB.save();
    toast(`Free stock allocated to ${job}.`, 'success');
    this.renderBom();
  },

  renderHistory() {
    const body = document.getElementById('bomHistoryBody');
    const linesBody = document.getElementById('bomHistoryLinesBody');
    if (!body || !linesBody) return;
    const runs = (DB.bomHistory || []).slice().sort((a, b) => String(b.at).localeCompare(String(a.at)));
    if (!runs.length) {
      body.innerHTML = '<tr class="table-empty"><td colspan="5">No history yet.</td></tr>';
      linesBody.innerHTML = '<tr class="table-empty"><td colspan="6">Open a stock check to see its lines.</td></tr>';
      return;
    }
    if (!runs.some(r => r.id === this.activeHistoryId)) this.activeHistoryId = runs[0].id;
    const active = runs.find(r => r.id === this.activeHistoryId) || runs[0];
    body.innerHTML = runs.map(run => `<tr>
      <td>${UI.esc(run.at ? new Date(run.at).toLocaleString() : '')}</td>
      <td>${UI.esc(run.jobNumber || '—')}</td>
      <td>${UI.esc(run.type || '')}</td>
      <td>${UI.esc(run.summary || '')}</td>
      <td>${(run.lines || []).length ? `<button type="button" class="btn btn-outline btn-sm" onclick="Engineering.openHistory('${UI.esc(run.id)}')">${run.id === active.id ? 'Showing' : 'Open'}</button>` : ''}</td>
    </tr>`).join('');
    const lines = active.lines || [];
    if (!lines.length) {
      linesBody.innerHTML = '<tr class="table-empty"><td colspan="6">This history entry has no stock-check lines.</td></tr>';
      return;
    }
    linesBody.innerHTML = lines.map(l => `<tr>
      <td>${UI.esc(l.partNumber)}</td>
      <td>${UI.esc(l.description || '—')}</td>
      <td>${UI.esc(l.bomQty)}</td>
      <td>${UI.esc(l.freeQty)}</td>
      <td>${UI.esc(l.shortBy)}</td>
      <td>${this.badge(l.status)}</td>
    </tr>`).join('');
  },

  openHistory(id) {
    this.activeHistoryId = id;
    this.renderHistory();
  },

  /* ---------- Pastel ---------- */

  readyForFinal() {
    this.ensure();
    const earlier = DB.pastelTimeline.filter(s => s.id !== 'final');
    const stepsDone = earlier.every(s => s.status === 'Done');
    const updatesClear = DB.pastelUpdates.every(u => u.status === 'Agreed');
    return stepsDone && updatesClear;
  },

  renderPastel() {
    this.ensure();
    const ready = this.readyForFinal();
    const openMine = DB.pastelUpdates.filter(u => u.status === 'Open' && u.owner === 'Me').length;
    const openCarl = DB.pastelUpdates.filter(u => u.status === 'Open' && u.owner === 'Carl Henry').length;
    const finalStep = DB.pastelTimeline.find(s => s.id === 'final');
    const gate = document.getElementById('pastelGate');
    if (gate) {
      if (ready) gate.textContent = 'The Parts Library check and the updates with Carl Henry are clear. The final Pastel update can be marked done.';
      else if (finalStep && finalStep.status === 'Done') gate.textContent = 'The final Pastel update is marked done, but earlier steps or open updates are still outstanding. Set it back to Pending until those are clear.';
      else gate.textContent = `Final Pastel update stays locked until every earlier step is Done and no updates are still Open. Open now: me ${openMine}, Carl Henry ${openCarl}.`;
    }
    const host = document.getElementById('pastelTimeline');
    if (host) {
      host.innerHTML = DB.pastelTimeline
        .slice()
        .sort((a, b) => a.order - b.order)
        .map(step => {
          const locked = step.id === 'final' && !ready && step.status !== 'Done';
          return `<div class="eng-step${locked ? ' is-locked' : ''}">
            <div class="eng-step-num">${step.order}</div>
            <div>
              <div class="eng-step-title">${UI.esc(step.title)}</div>
              <div class="eng-reason">${UI.esc(step.owner)}</div>
            </div>
            <select class="form-select" ${locked ? 'disabled' : ''} onchange="Engineering.updateStep('${step.id}','status',this.value)">
              ${['Pending', 'In progress', 'Done'].map(s => `<option${s === step.status ? ' selected' : ''}>${s}</option>`).join('')}
            </select>
            <input type="date" class="form-input" value="${UI.esc(step.dueDate || '')}" onchange="Engineering.updateStep('${step.id}','dueDate',this.value)" />
            <input type="text" class="form-input" placeholder="Notes" value="${UI.esc(step.notes || '')}" onchange="Engineering.updateStep('${step.id}','notes',this.value)" />
          </div>`;
        }).join('');
    }
    const updates = document.getElementById('pastelUpdateBody');
    if (updates) {
      if (!DB.pastelUpdates.length) {
        updates.innerHTML = '<tr class="table-empty"><td colspan="5">No outstanding updates. Add anything you and Carl Henry still need to agree before the final Pastel update.</td></tr>';
      } else {
        updates.innerHTML = DB.pastelUpdates.map(u => `<tr>
          <td>${UI.esc(u.owner)}</td>
          <td>${UI.esc(u.partNumber || '—')}</td>
          <td>${UI.esc(u.description || '—')}</td>
          <td><select class="form-select" onchange="Engineering.updatePastelItem('${u.id}',this.value)">
            ${['Open', 'Agreed'].map(s => `<option${s === u.status ? ' selected' : ''}>${s}</option>`).join('')}
          </select></td>
          <td><button type="button" class="btn btn-outline btn-sm" onclick="Engineering.deletePastelItem('${u.id}')">Remove</button></td>
        </tr>`).join('');
      }
    }
    this.renderPastelChecks();
  },

  renderPastelChecks() {
    const body = document.getElementById('pastelCheckBody');
    const meta = document.getElementById('pastelCheckMeta');
    if (!body) return;
    const filter = this.pastelFilter;
    const lines = DB.pastelChecks.filter(l => !filter || l.status === filter);
    if (meta) {
      const matched = DB.pastelChecks.filter(l => l.status === 'Matched').length;
      const pastelOnly = DB.pastelChecks.filter(l => l.status === 'Pastel only').length;
      const libraryOnly = DB.pastelChecks.filter(l => l.status === 'Library only').length;
      meta.textContent = DB.pastelChecks.length
        ? `${matched} matched · ${pastelOnly} Pastel only · ${libraryOnly} library only`
        : 'No check run yet';
    }
    if (!lines.length) {
      body.innerHTML = '<tr class="table-empty"><td colspan="5">Import a Pastel stock export, then run the check against Parts Library lines on the BOM.</td></tr>';
      return;
    }
    body.innerHTML = lines.map(l => `<tr>
      <td>${UI.esc(l.partNumber)}</td>
      <td>${UI.esc(l.description || '—')}</td>
      <td>${l.pastelQty == null ? '—' : UI.esc(l.pastelQty)}</td>
      <td>${l.libraryQty == null ? '—' : UI.esc(l.libraryQty)}</td>
      <td>${this.badge(l.status)}</td>
    </tr>`).join('');
  },

  updateStep(id, field, value) {
    this.ensure();
    const step = DB.pastelTimeline.find(s => s.id === id);
    if (!step) return;
    if (step.id === 'final' && field === 'status' && value === 'Done' && !this.readyForFinal()) {
      toast('Finish the earlier steps and clear open updates with Carl Henry before the final Pastel update.', 'error');
      this.renderPastel();
      return;
    }
    step[field] = value;
    DB.save();
    if (field !== 'notes' && field !== 'dueDate') this.renderPastel();
    else DB.save();
  },

  addPastelUpdate() {
    this.ensure();
    const description = document.getElementById('puNote').value.trim();
    const partNumber = document.getElementById('puPn').value.trim();
    if (!description && !partNumber) { toast('Enter the part or what still needs to be agreed.', 'error'); return; }
    DB.pastelUpdates.push({
      id: uid(),
      owner: document.getElementById('puOwner').value,
      partNumber,
      description,
      status: 'Open',
      notes: ''
    });
    DB.save();
    document.getElementById('puPn').value = '';
    document.getElementById('puNote').value = '';
    this.renderPastel();
  },

  updatePastelItem(id, status) {
    const item = DB.pastelUpdates.find(u => u.id === id);
    if (!item) return;
    item.status = status;
    DB.save();
    this.renderPastel();
  },

  deletePastelItem(id) {
    DB.pastelUpdates = DB.pastelUpdates.filter(u => u.id !== id);
    DB.save();
    this.renderPastel();
  },

  async importPastel(file) {
    if (!file) return;
    this._pastelRows = null;
    try {
      const rows = await this.readSheet(file);
      const parsed = [];
      rows.forEach(row => {
        const partNumber = this.pick(row, ['code', 'itemcode', 'stockcode', 'partnumber', 'partno', 'pn']);
        if (!partNumber) return;
        parsed.push({
          partNumber,
          description: this.pick(row, ['description', 'desc', 'name']),
          qty: this.num(this.pick(row, ['qty', 'quantity', 'onhand', 'unposted', 'qtyonhand', 'soh']))
        });
      });
      this._pastelRows = parsed;
      toast(`Pastel file loaded — ${parsed.length} stock lines. Run the check when you are ready.`, 'success');
    } catch (err) {
      toast('Could not read that Pastel file. ' + err.message, 'error');
    }
    const input = document.getElementById('pastelImportFile');
    if (input) input.value = '';
  },

  runPastelCheck() {
    this.ensure();
    const pastel = this._pastelRows;
    if (!pastel || !pastel.length) {
      toast('Import a Pastel stock export first.', 'error');
      return;
    }
    const library = new Map();
    DB.bomLines.filter(l => l.source === 'Parts Library').forEach(l => {
      const key = this.norm(l.partNumber);
      if (!key) return;
      const cur = library.get(key) || { partNumber: l.partNumber, description: l.description, qty: 0 };
      cur.qty += this.num(l.qty);
      if (!cur.description) cur.description = l.description;
      library.set(key, cur);
    });
    if (!library.size) {
      toast('Add Parts Library lines on the BOM before this check.', 'error');
      return;
    }
    const pastelMap = new Map();
    pastel.forEach(row => {
      const key = this.norm(row.partNumber);
      if (!key) return;
      const cur = pastelMap.get(key) || { partNumber: row.partNumber, description: row.description, qty: 0 };
      cur.qty += this.num(row.qty);
      if (!cur.description) cur.description = row.description;
      pastelMap.set(key, cur);
    });
    const keys = new Set([...library.keys(), ...pastelMap.keys()]);
    DB.pastelChecks = [...keys].map(key => {
      const lib = library.get(key);
      const pas = pastelMap.get(key);
      let status = 'Matched';
      if (lib && !pas) status = 'Library only';
      else if (pas && !lib) status = 'Pastel only';
      return {
        id: uid(),
        partNumber: (pas || lib).partNumber,
        description: (pas && pas.description) || (lib && lib.description) || '',
        pastelQty: pas ? pas.qty : null,
        libraryQty: lib ? lib.qty : null,
        status
      };
    }).sort((a, b) => a.status.localeCompare(b.status) || a.partNumber.localeCompare(b.partNumber));
    const checkStep = DB.pastelTimeline.find(s => s.id === 'check');
    if (checkStep && checkStep.status === 'Pending') checkStep.status = 'In progress';
    DB.save();
    const pastelOnly = DB.pastelChecks.filter(l => l.status === 'Pastel only').length;
    const libraryOnly = DB.pastelChecks.filter(l => l.status === 'Library only').length;
    toast(`Check finished. ${pastelOnly} Pastel only, ${libraryOnly} library only.`, 'success');
    this.renderPastel();
  }
};

window.Engineering = Engineering;
