(function () {
  const STORE_KEY = 'lms-asset-lifecycle';
  const SITES_KEY = 'lms-app-sites';
  const CATEGORIES = ['Control unit', 'Sensor', 'Communication', 'Dispensing', 'Tank', 'Mining equipment', 'Power', 'Other'];
  const DEFAULT_STAGES = [
    ['Procurement', 1],
    ['Installation & commissioning', 1],
    ['In service', 0],
    ['Scheduled maintenance', 0],
    ['Refurbishment', 1],
    ['Decommission & disposal', 1]
  ];

  const view = document.getElementById('alView');
  const ui = { typeTab: 'bom', search: '', category: '' };
  let state = load();

  // ---------- storage ----------
  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      return {
        types: Array.isArray(raw.types) ? raw.types : [],
        groups: Array.isArray(raw.groups) ? raw.groups : [],
        allocations: Array.isArray(raw.allocations) ? raw.allocations : []
      };
    } catch (_) {
      return { types: [], groups: [], allocations: [] };
    }
  }

  function save() {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }

  function sites() {
    try {
      const list = JSON.parse(localStorage.getItem(SITES_KEY) || '[]');
      if (!Array.isArray(list)) return [];
      return list.map(s => ({
        id: String(s.id || ''),
        label: [s.clientName, s.siteName || s.terminalName, s.siteNo != null ? 'Site ' + s.siteNo : '']
          .filter(Boolean).join(' · ') || String(s.id || 'Site')
      })).filter(s => s.id);
    } catch (_) {
      return [];
    }
  }

  // ---------- helpers ----------
  const uid = p => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const now = () => new Date().toISOString();
  const num = v => { const n = parseFloat(v); return Number.isFinite(n) && n >= 0 ? n : 0; };
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDate = iso => iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
  const typeById = id => state.types.find(t => t.id === id);
  const groupById = id => state.groups.find(g => g.id === id);

  function toast(msg, isError) {
    const el = document.getElementById('alToast');
    el.textContent = msg;
    el.className = 'al-toast show' + (isError ? ' error' : '');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { el.className = 'al-toast'; }, 2400);
  }

  function nextCode() {
    let max = 0;
    state.types.forEach(t => { const m = /^EQ-(\d+)$/.exec(t.code || ''); if (m) max = Math.max(max, +m[1]); });
    return 'EQ-' + String(max + 1).padStart(3, '0');
  }

  function newLifecycle() {
    return {
      expectedLifeYears: 10,
      warrantyMonths: 12,
      serviceIntervalMonths: 6,
      stages: DEFAULT_STAGES.map(([name, months]) => ({ id: uid('stg'), name, durationMonths: months, notes: '' }))
    };
  }

  function bomQty(type) {
    return (type.bom || []).reduce((sum, l) => sum + num(l.qty), 0);
  }

  function groupsUsingType(typeId) {
    return state.groups.filter(g => (g.items || []).some(i => i.typeId === typeId));
  }

  // ---------- routing ----------
  function route() {
    const hash = location.hash.replace(/^#/, '') || 'standard';
    const [page, id] = hash.split('/');
    document.querySelectorAll('[data-al-nav]').forEach(a => {
      const active = a.dataset.alNav === page || (page === 'type' && a.dataset.alNav === 'standard');
      a.classList.toggle('active', active);
    });
    if (page === 'type' && typeById(id)) return renderType(typeById(id));
    if (page === 'groups') return renderGroups();
    if (page !== 'standard') history.replaceState(null, '', '#standard');
    renderStandard();
  }

  // ---------- standard equipment list ----------
  function renderStandard() {
    const q = ui.search.trim().toLowerCase();
    const list = state.types
      .filter(t => !ui.category || t.category === ui.category)
      .filter(t => !q || [t.code, t.name, t.category, t.description].join(' ').toLowerCase().includes(q))
      .sort((a, b) => (a.code || '').localeCompare(b.code || ''));
    const cats = [...new Set([...CATEGORIES, ...state.types.map(t => t.category).filter(Boolean)])];

    view.innerHTML = `
      <div class="al-head">
        <div>
          <p class="al-eyebrow">Asset Lifecycle</p>
          <h1>Standard Equipment</h1>
          <p>Your list of standard equipment types. Click a block to see its BOM and asset lifecycle.</p>
        </div>
      </div>

      <div class="al-panel">
        <h2>Add a standard equipment type</h2>
        <form class="al-form" data-form="new-type">
          <div class="al-field"><label for="ntCode">Code</label><input id="ntCode" name="code" value="${esc(nextCode())}" required /></div>
          <div class="al-field"><label for="ntName">Name</label><input id="ntName" name="name" placeholder="e.g. Fuel-IT Control Unit" required /></div>
          <div class="al-field"><label for="ntCat">Category</label>
            <input id="ntCat" name="category" list="alCategories" placeholder="Choose or type" /></div>
          <div class="al-field wide"><label for="ntDesc">Description</label><input id="ntDesc" name="description" placeholder="Short description" /></div>
          <div class="al-actions"><button class="al-btn primary" type="submit">Add to list</button></div>
        </form>
        <datalist id="alCategories">${cats.map(c => `<option value="${esc(c)}"></option>`).join('')}</datalist>
      </div>

      <div class="al-panel">
        <div class="al-panel-head">
          <h2>Equipment types <span class="al-chip slate">${state.types.length}</span></h2>
          <div class="al-filters">
            <input type="search" data-input="search" placeholder="Search code, name…" value="${esc(ui.search)}" />
            <select data-input="category">
              <option value="">All categories</option>
              ${cats.map(c => `<option ${c === ui.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}
            </select>
          </div>
        </div>
        ${list.length ? `<div class="al-grid">${list.map(tile).join('')}</div>`
          : `<div class="al-empty">${state.types.length ? 'No equipment types match your filter.' : 'No standard equipment yet. Add your first type above.'}</div>`}
      </div>`;
  }

  function tile(t) {
    const lc = t.lifecycle || {};
    const inGroups = groupsUsingType(t.id).length;
    return `
      <button type="button" class="al-tile" data-action="open-type" data-id="${esc(t.id)}">
        <span class="al-code">${esc(t.code)}</span>
        <h3>${esc(t.name)}</h3>
        <p>${esc(t.description || t.category || 'No description')}</p>
        <div class="al-meta">
          ${t.category ? `<span class="al-chip slate">${esc(t.category)}</span>` : ''}
          <span class="al-chip ${(t.bom || []).length ? '' : 'warn'}">BOM: ${(t.bom || []).length} line${(t.bom || []).length === 1 ? '' : 's'}</span>
          <span class="al-chip">Life: ${num(lc.expectedLifeYears)} yrs</span>
          ${inGroups ? `<span class="al-chip slate">${inGroups} group${inGroups === 1 ? '' : 's'}</span>` : ''}
        </div>
      </button>`;
  }

  // ---------- equipment type detail ----------
  function renderType(t) {
    const lc = t.lifecycle || (t.lifecycle = newLifecycle());
    const cats = [...new Set([...CATEGORIES, ...state.types.map(x => x.category).filter(Boolean)])];
    view.innerHTML = `
      <div class="al-head">
        <div>
          <a class="al-crumb" href="#standard">← Standard Equipment</a>
          <p class="al-eyebrow" style="margin-top:.5rem">${esc(t.code)}</p>
          <h1>${esc(t.name)}</h1>
        </div>
        <div class="al-actions"><button class="al-btn danger" type="button" data-action="delete-type">Delete type</button></div>
      </div>

      <div class="al-panel">
        <form class="al-form" data-form="edit-type">
          <div class="al-field"><label>Code</label><input name="code" value="${esc(t.code)}" required /></div>
          <div class="al-field"><label>Name</label><input name="name" value="${esc(t.name)}" required /></div>
          <div class="al-field"><label>Category</label><input name="category" list="alCategories" value="${esc(t.category)}" /></div>
          <div class="al-field wide"><label>Description</label><input name="description" value="${esc(t.description)}" /></div>
          <div class="al-actions"><button class="al-btn dark" type="submit">Save details</button></div>
        </form>
        <datalist id="alCategories">${cats.map(c => `<option value="${esc(c)}"></option>`).join('')}</datalist>
      </div>

      <div class="al-panel">
        <div class="al-tabs" role="tablist">
          <button type="button" class="al-tab ${ui.typeTab === 'bom' ? 'active' : ''}" data-action="tab" data-tab="bom">BOM</button>
          <button type="button" class="al-tab ${ui.typeTab === 'lifecycle' ? 'active' : ''}" data-action="tab" data-tab="lifecycle">Asset lifecycle</button>
        </div>
        <div style="padding-top:1rem">${ui.typeTab === 'lifecycle' ? lifecycleHtml(lc) : bomHtml(t)}</div>
      </div>`;
  }

  function bomHtml(t) {
    const lines = t.bom || [];
    return `
      <div class="al-panel-head">
        <h2>Bill of materials <span class="al-chip slate">${lines.length} line${lines.length === 1 ? '' : 's'} · ${bomQty(t)} items</span></h2>
        <div class="al-actions">
          <label class="al-btn ghost" style="display:inline-block">Import CSV<input type="file" accept=".csv,.txt,.tsv" data-input="bom-file" hidden /></label>
          <button class="al-btn primary" type="button" data-action="add-bom">Add line</button>
        </div>
      </div>
      <div class="al-table-wrap">
        <table class="al-table">
          <thead><tr><th>Part number</th><th>Description</th><th class="num">Qty</th><th>Unit</th><th>Notes</th><th></th></tr></thead>
          <tbody>
            ${lines.length ? lines.map(l => `
              <tr data-line="${esc(l.id)}">
                <td><input data-bom="partNo" value="${esc(l.partNo)}" placeholder="Part no." /></td>
                <td><input data-bom="description" value="${esc(l.description)}" placeholder="Description" /></td>
                <td class="num"><input data-bom="qty" type="number" min="0" step="any" value="${esc(l.qty)}" /></td>
                <td><input data-bom="unit" value="${esc(l.unit)}" placeholder="ea" style="max-width:80px" /></td>
                <td><input data-bom="notes" value="${esc(l.notes)}" /></td>
                <td class="act"><button class="al-btn danger sm" type="button" data-action="del-bom" data-id="${esc(l.id)}">Remove</button></td>
              </tr>`).join('')
            : `<tr><td colspan="6" class="al-empty">No BOM lines yet. Add a line or import a CSV with columns: part number, description, qty, unit.</td></tr>`}
          </tbody>
        </table>
      </div>`;
  }

  function lifecycleHtml(lc) {
    const stages = lc.stages || [];
    const totalMonths = stages.reduce((s, x) => s + num(x.durationMonths), 0);
    const services = num(lc.serviceIntervalMonths) ? Math.floor((num(lc.expectedLifeYears) * 12) / num(lc.serviceIntervalMonths)) : 0;
    return `
      <div class="al-form" data-lc-form>
        <div class="al-field"><label>Expected life (years)</label><input type="number" min="0" step="any" data-lc="expectedLifeYears" value="${esc(lc.expectedLifeYears)}" /></div>
        <div class="al-field"><label>Warranty (months)</label><input type="number" min="0" step="1" data-lc="warrantyMonths" value="${esc(lc.warrantyMonths)}" /></div>
        <div class="al-field"><label>Service interval (months)</label><input type="number" min="0" step="1" data-lc="serviceIntervalMonths" value="${esc(lc.serviceIntervalMonths)}" /></div>
      </div>

      <div class="al-stats" style="margin-top:1rem">
        <div class="al-stat"><span>Expected life</span><strong>${num(lc.expectedLifeYears)} yrs</strong></div>
        <div class="al-stat"><span>Warranty</span><strong>${num(lc.warrantyMonths)} mo</strong></div>
        <div class="al-stat"><span>Services over life</span><strong>${services}</strong></div>
        <div class="al-stat"><span>Stages</span><strong>${stages.length}</strong></div>
      </div>

      ${stages.length ? `<div class="al-timeline" style="margin-top:1.25rem">${stages.map((s, i) => `
        <div class="al-step"><span class="dot">${i + 1}</span><b>${esc(s.name || 'Stage')}</b>
          <small>${num(s.durationMonths) ? num(s.durationMonths) + ' mo' : 'ongoing'}</small></div>`).join('')}</div>` : ''}

      <div class="al-panel-head" style="margin-top:1rem">
        <h2>Lifecycle stages <span class="al-chip slate">${totalMonths} mo fixed</span></h2>
        <div class="al-actions">
          <button class="al-btn ghost" type="button" data-action="reset-stages">Reset to default</button>
          <button class="al-btn primary" type="button" data-action="add-stage">Add stage</button>
        </div>
      </div>
      <div class="al-table-wrap">
        <table class="al-table">
          <thead><tr><th style="width:40px">#</th><th>Stage</th><th class="num">Months</th><th>Notes</th><th></th></tr></thead>
          <tbody>
            ${stages.length ? stages.map((s, i) => `
              <tr data-stage="${esc(s.id)}">
                <td>${i + 1}</td>
                <td><input data-stg="name" value="${esc(s.name)}" /></td>
                <td class="num"><input data-stg="durationMonths" type="number" min="0" step="any" value="${esc(s.durationMonths)}" title="0 = ongoing" /></td>
                <td><input data-stg="notes" value="${esc(s.notes)}" placeholder="What happens at this stage" /></td>
                <td class="act">
                  <button class="al-btn ghost sm" type="button" data-action="move-stage" data-dir="-1" data-id="${esc(s.id)}" ${i === 0 ? 'disabled' : ''}>↑</button>
                  <button class="al-btn ghost sm" type="button" data-action="move-stage" data-dir="1" data-id="${esc(s.id)}" ${i === stages.length - 1 ? 'disabled' : ''}>↓</button>
                  <button class="al-btn danger sm" type="button" data-action="del-stage" data-id="${esc(s.id)}">Remove</button>
                </td>
              </tr>`).join('')
            : `<tr><td colspan="5" class="al-empty">No stages. Add one or reset to the default lifecycle.</td></tr>`}
          </tbody>
        </table>
      </div>`;
  }

  // ---------- equipment groups ----------
  function renderGroups() {
    const siteList = sites();
    const typeOptions = state.types.slice().sort((a, b) => (a.code || '').localeCompare(b.code || ''))
      .map(t => `<option value="${esc(t.id)}">${esc(t.code)} — ${esc(t.name)}</option>`).join('');

    view.innerHTML = `
      <div class="al-head">
        <div>
          <p class="al-eyebrow">Asset Lifecycle</p>
          <h1>Equipment Groups</h1>
          <p>Group standard equipment together, then allocate the group to a site.</p>
        </div>
      </div>

      <div class="al-panel">
        <h2>Create an equipment group</h2>
        <form class="al-form" data-form="new-group">
          <div class="al-field"><label>Group name</label><input name="name" placeholder="e.g. Standard tank farm kit" required /></div>
          <div class="al-field wide"><label>Description</label><input name="description" placeholder="What this group is for" /></div>
          <div class="al-actions"><button class="al-btn primary" type="submit">Create group</button></div>
        </form>
        ${state.types.length ? '' : `<p class="al-empty" style="padding-bottom:0">Add equipment on <a href="#standard">Standard Equipment</a> first so you can put it in a group.</p>`}
      </div>

      ${state.groups.length ? state.groups.map(g => groupCard(g, typeOptions, siteList)).join('')
        : `<div class="al-panel"><div class="al-empty">No equipment groups yet.</div></div>`}

      <div class="al-panel">
        <h2>Allocation history</h2>
        ${allocationTable()}
      </div>`;
  }

  function groupCard(g, typeOptions, siteList) {
    const items = g.items || [];
    const totalUnits = items.reduce((s, i) => s + num(i.qty), 0);
    const allocs = state.allocations.filter(a => a.groupId === g.id);
    return `
      <div class="al-group-card" data-group="${esc(g.id)}">
        <div class="al-group-top">
          <div>
            <h3>${esc(g.name)}</h3>
            <p>${esc(g.description || 'No description')}</p>
          </div>
          <div class="al-actions">
            <span class="al-chip slate">${items.length} type${items.length === 1 ? '' : 's'} · ${totalUnits} units</span>
            <span class="al-chip">${allocs.length} allocation${allocs.length === 1 ? '' : 's'}</span>
            <button class="al-btn danger sm" type="button" data-action="del-group" data-id="${esc(g.id)}">Delete group</button>
          </div>
        </div>
        <div class="al-group-body">
          <div class="al-table-wrap">
            <table class="al-table">
              <thead><tr><th>Code</th><th>Equipment</th><th>Category</th><th class="num">Qty</th><th class="num">BOM lines</th><th>Life</th><th></th></tr></thead>
              <tbody>
                ${items.length ? items.map(i => {
                  const t = typeById(i.typeId);
                  if (!t) return `<tr><td colspan="6" class="al-empty">Equipment type was deleted</td><td class="act"><button class="al-btn danger sm" type="button" data-action="del-member" data-id="${esc(i.typeId)}">Remove</button></td></tr>`;
                  return `
                    <tr>
                      <td><a href="#type/${esc(t.id)}" class="al-crumb">${esc(t.code)}</a></td>
                      <td>${esc(t.name)}</td>
                      <td>${esc(t.category || '—')}</td>
                      <td class="num"><input type="number" min="1" step="1" data-member-qty="${esc(t.id)}" value="${esc(i.qty)}" /></td>
                      <td class="num">${(t.bom || []).length}</td>
                      <td>${num((t.lifecycle || {}).expectedLifeYears)} yrs</td>
                      <td class="act"><button class="al-btn danger sm" type="button" data-action="del-member" data-id="${esc(t.id)}">Remove</button></td>
                    </tr>`;
                }).join('') : `<tr><td colspan="7" class="al-empty">No equipment in this group yet.</td></tr>`}
              </tbody>
            </table>
          </div>

          ${state.types.length ? `
          <form class="al-form" data-form="add-member">
            <div class="al-field wide"><label>Add equipment</label><select name="typeId" required><option value="">Choose standard equipment…</option>${typeOptions}</select></div>
            <div class="al-field"><label>Qty</label><input name="qty" type="number" min="1" step="1" value="1" required /></div>
            <div class="al-actions"><button class="al-btn ghost" type="submit">Add to group</button></div>
          </form>` : ''}

          <form class="al-form" data-form="allocate">
            <div class="al-field wide"><label>Allocate group to site</label>
              <select name="siteId">
                <option value="">${siteList.length ? 'Choose a site…' : 'No sites yet — type one below'}</option>
                ${siteList.map(s => `<option value="${esc(s.id)}">${esc(s.label)}</option>`).join('')}
              </select>
            </div>
            <div class="al-field"><label>Or site / client name</label><input name="siteName" placeholder="Free text" /></div>
            <div class="al-field"><label>Date</label><input name="date" type="date" value="${new Date().toISOString().slice(0, 10)}" /></div>
            <div class="al-field"><label>Notes</label><input name="notes" /></div>
            <div class="al-actions"><button class="al-btn primary" type="submit">Allocate group</button></div>
          </form>
        </div>
      </div>`;
  }

  function allocationTable() {
    const rows = state.allocations.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    if (!rows.length) return `<div class="al-empty">No groups allocated yet.</div>`;
    return `
      <div class="al-table-wrap">
        <table class="al-table">
          <thead><tr><th>Date</th><th>Group</th><th>Site</th><th class="num">Units</th><th>Notes</th><th></th></tr></thead>
          <tbody>
            ${rows.map(a => `
              <tr>
                <td>${esc(fmtDate(a.date || a.createdAt))}</td>
                <td>${esc(a.groupName)}</td>
                <td>${esc(a.siteLabel)}</td>
                <td class="num">${esc(a.units)}</td>
                <td>${esc(a.notes || '')}</td>
                <td class="act"><button class="al-btn danger sm" type="button" data-action="del-alloc" data-id="${esc(a.id)}">Remove</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  // ---------- CSV import ----------
  function parseBomCsv(text) {
    const rows = text.split(/\r?\n/).map(r => r.trim()).filter(Boolean);
    if (!rows.length) return [];
    const delim = rows[0].includes('\t') ? '\t' : rows[0].includes(';') && !rows[0].includes(',') ? ';' : ',';
    const split = line => {
      const out = []; let cur = ''; let quoted = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') { if (quoted && line[i + 1] === '"') { cur += '"'; i++; } else quoted = !quoted; }
        else if (c === delim && !quoted) { out.push(cur.trim()); cur = ''; }
        else cur += c;
      }
      out.push(cur.trim());
      return out;
    };
    let cells = rows.map(split);
    const head = cells[0].map(h => h.toLowerCase());
    const find = (...keys) => head.findIndex(h => keys.some(k => h.includes(k)));
    let col = { part: 0, desc: 1, qty: 2, unit: 3 };
    if (find('part', 'item', 'code') >= 0 || find('desc') >= 0 || find('qty', 'quantity') >= 0) {
      col = { part: find('part', 'item', 'code'), desc: find('desc'), qty: find('qty', 'quantity'), unit: find('unit', 'uom') };
      cells = cells.slice(1);
    }
    return cells.map(c => ({
      id: uid('bom'),
      partNo: col.part >= 0 ? c[col.part] || '' : '',
      description: col.desc >= 0 ? c[col.desc] || '' : '',
      qty: col.qty >= 0 ? num(c[col.qty]) || 1 : 1,
      unit: col.unit >= 0 ? c[col.unit] || 'ea' : 'ea',
      notes: ''
    })).filter(l => l.partNo || l.description);
  }

  // ---------- events ----------
  function currentType() {
    const m = /^#type\/(.+)$/.exec(location.hash);
    return m ? typeById(m[1]) : null;
  }

  view.addEventListener('submit', e => {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form).entries());
    const kind = form.dataset.form;

    if (kind === 'new-type') {
      const code = (f.code || '').trim() || nextCode();
      if (state.types.some(t => (t.code || '').toLowerCase() === code.toLowerCase())) return toast('That code is already on the list.', true);
      const t = { id: uid('eq'), code, name: f.name.trim(), category: (f.category || '').trim(), description: (f.description || '').trim(), bom: [], lifecycle: newLifecycle(), createdAt: now(), updatedAt: now() };
      state.types.push(t);
      save();
      toast(t.name + ' added.');
      ui.typeTab = 'bom';
      location.hash = 'type/' + t.id;
      return;
    }

    if (kind === 'edit-type') {
      const t = currentType(); if (!t) return;
      const code = (f.code || '').trim();
      if (!code || !f.name.trim()) return toast('Code and name are required.', true);
      if (state.types.some(x => x.id !== t.id && (x.code || '').toLowerCase() === code.toLowerCase())) return toast('That code is already used.', true);
      Object.assign(t, { code, name: f.name.trim(), category: (f.category || '').trim(), description: (f.description || '').trim(), updatedAt: now() });
      save(); renderType(t); toast('Details saved.');
      return;
    }

    if (kind === 'new-group') {
      state.groups.push({ id: uid('grp'), name: f.name.trim(), description: (f.description || '').trim(), items: [], createdAt: now() });
      save(); renderGroups(); toast('Group created.');
      return;
    }

    const g = groupById(form.closest('[data-group]')?.dataset.group);
    if (!g) return;

    if (kind === 'add-member') {
      if (!f.typeId) return toast('Choose a piece of equipment.', true);
      const qty = Math.max(1, Math.round(num(f.qty)));
      const existing = g.items.find(i => i.typeId === f.typeId);
      if (existing) existing.qty = num(existing.qty) + qty; else g.items.push({ typeId: f.typeId, qty });
      save(); renderGroups(); toast('Added to ' + g.name + '.');
      return;
    }

    if (kind === 'allocate') {
      if (!g.items.length) return toast('Add equipment to the group before allocating it.', true);
      const site = sites().find(s => s.id === f.siteId);
      const siteLabel = (f.siteName || '').trim() || (site && site.label);
      if (!siteLabel) return toast('Choose a site or type a site name.', true);
      state.allocations.push({
        id: uid('alc'), groupId: g.id, groupName: g.name, siteId: site ? site.id : '', siteLabel,
        units: g.items.reduce((s, i) => s + num(i.qty), 0),
        items: g.items.map(i => { const t = typeById(i.typeId); return { typeId: i.typeId, code: t ? t.code : '', name: t ? t.name : '', qty: i.qty }; }),
        date: f.date ? new Date(f.date).toISOString() : now(), notes: (f.notes || '').trim(), createdAt: now()
      });
      save(); renderGroups(); toast(g.name + ' allocated to ' + siteLabel + '.');
    }
  });

  view.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const t = currentType();

    if (action === 'open-type') { ui.typeTab = 'bom'; location.hash = 'type/' + btn.dataset.id; return; }
    if (action === 'tab') { ui.typeTab = btn.dataset.tab; return t && renderType(t); }

    if (action === 'delete-type' && t) {
      const used = groupsUsingType(t.id);
      const msg = used.length ? `${t.name} is in ${used.length} group(s). Delete it and remove it from those groups?` : `Delete ${t.name}?`;
      if (!confirm(msg)) return;
      state.groups.forEach(g => { g.items = (g.items || []).filter(i => i.typeId !== t.id); });
      state.types = state.types.filter(x => x.id !== t.id);
      save(); toast('Equipment type deleted.'); location.hash = 'standard';
      return;
    }

    if (action === 'add-bom' && t) {
      (t.bom = t.bom || []).push({ id: uid('bom'), partNo: '', description: '', qty: 1, unit: 'ea', notes: '' });
      t.updatedAt = now(); save(); renderType(t);
      view.querySelector('tbody tr:last-child input')?.focus();
      return;
    }
    if (action === 'del-bom' && t) {
      t.bom = (t.bom || []).filter(l => l.id !== btn.dataset.id);
      t.updatedAt = now(); save(); renderType(t);
      return;
    }

    if (t && ['add-stage', 'del-stage', 'move-stage', 'reset-stages'].includes(action)) {
      const lc = t.lifecycle || (t.lifecycle = newLifecycle());
      if (action === 'add-stage') lc.stages.push({ id: uid('stg'), name: 'New stage', durationMonths: 0, notes: '' });
      if (action === 'del-stage') lc.stages = lc.stages.filter(s => s.id !== btn.dataset.id);
      if (action === 'reset-stages') {
        if (!confirm('Replace the stages with the default lifecycle?')) return;
        lc.stages = newLifecycle().stages;
      }
      if (action === 'move-stage') {
        const i = lc.stages.findIndex(s => s.id === btn.dataset.id);
        const j = i + Number(btn.dataset.dir);
        if (i >= 0 && j >= 0 && j < lc.stages.length) [lc.stages[i], lc.stages[j]] = [lc.stages[j], lc.stages[i]];
      }
      t.updatedAt = now(); save(); renderType(t);
      return;
    }

    if (action === 'del-group') {
      const g = groupById(btn.dataset.id);
      if (!g || !confirm(`Delete group ${g.name}? Its allocation history is kept.`)) return;
      state.groups = state.groups.filter(x => x.id !== g.id);
      save(); renderGroups(); toast('Group deleted.');
      return;
    }
    if (action === 'del-member') {
      const g = groupById(btn.closest('[data-group]')?.dataset.group);
      if (!g) return;
      g.items = g.items.filter(i => i.typeId !== btn.dataset.id);
      save(); renderGroups();
      return;
    }
    if (action === 'del-alloc') {
      if (!confirm('Remove this allocation from the history?')) return;
      state.allocations = state.allocations.filter(a => a.id !== btn.dataset.id);
      save(); renderGroups();
    }
  });

  view.addEventListener('input', e => {
    const el = e.target;
    if (el.dataset.input === 'search') {
      ui.search = el.value;
      const pos = el.selectionStart;
      renderStandard();
      const again = view.querySelector('[data-input="search"]');
      again.focus(); again.setSelectionRange(pos, pos);
    }
  });

  view.addEventListener('change', e => {
    const el = e.target;
    if (el.dataset.input === 'category') { ui.category = el.value; return renderStandard(); }

    if (el.dataset.input === 'bom-file') {
      const t = currentType(); const file = el.files && el.files[0];
      if (!t || !file) return;
      file.text().then(text => {
        const lines = parseBomCsv(text);
        if (!lines.length) return toast('No BOM lines found in that file.', true);
        t.bom = (t.bom || []).concat(lines); t.updatedAt = now(); save(); renderType(t);
        toast(lines.length + ' BOM line' + (lines.length === 1 ? '' : 's') + ' imported.');
      });
      return;
    }

    const t = currentType();
    if (t && el.dataset.bom) {
      const line = (t.bom || []).find(l => l.id === el.closest('[data-line]')?.dataset.line);
      if (!line) return;
      line[el.dataset.bom] = el.dataset.bom === 'qty' ? num(el.value) : el.value.trim();
      t.updatedAt = now(); save();
      if (el.dataset.bom === 'qty') renderType(t);
      return;
    }
    if (t && el.dataset.lc) {
      t.lifecycle[el.dataset.lc] = num(el.value);
      t.updatedAt = now(); save(); renderType(t);
      return;
    }
    if (t && el.dataset.stg) {
      const stage = t.lifecycle.stages.find(s => s.id === el.closest('[data-stage]')?.dataset.stage);
      if (!stage) return;
      stage[el.dataset.stg] = el.dataset.stg === 'durationMonths' ? num(el.value) : el.value.trim();
      t.updatedAt = now(); save(); renderType(t);
      return;
    }
    if (el.dataset.memberQty) {
      const g = groupById(el.closest('[data-group]')?.dataset.group);
      const item = g && g.items.find(i => i.typeId === el.dataset.memberQty);
      if (!item) return;
      item.qty = Math.max(1, Math.round(num(el.value)));
      save(); renderGroups();
    }
  });

  window.addEventListener('hashchange', route);
  window.addEventListener('storage', e => { if (e.key === STORE_KEY) { state = load(); route(); } });
  route();
})();
