/**
 * Clear ManageIT stock and import from Sage-style inventory export.
 * Usage: node tools/import-inventory-xlsx.js "path/to/file.xlsx"
 */
'use strict';

const fs = require('fs');
const path = require('path');

const API = process.env.MANAGEIT_API || 'http://localhost:5000';
const SAL = process.env.MANAGEIT_SAL || '10001';
const PASSWORD = process.env.MANAGEIT_PASSWORD || 'admin123';
const XLSX_PATH = process.argv[2] || 'c:\\Users\\Justin\\Downloads\\Inventory Export 07-09-2026.xlsx';

async function main() {
  const xlsxDir = path.join(__dirname, 'xlsx-import');
  if (!fs.existsSync(path.join(xlsxDir, 'node_modules', 'xlsx'))) {
    fs.mkdirSync(xlsxDir, { recursive: true });
    if (!fs.existsSync(path.join(xlsxDir, 'package.json'))) {
      fs.writeFileSync(path.join(xlsxDir, 'package.json'), JSON.stringify({ name: 'manageit-xlsx-import', private: true }, null, 2));
    }
    require('child_process').execSync('npm install xlsx', { cwd: xlsxDir, stdio: 'inherit' });
  }
  const XLSX = require(path.join(xlsxDir, 'node_modules', 'xlsx'));

  const loginRes = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ salNumber: SAL, password: PASSWORD })
  });
  const login = await loginRes.json();
  if (!login.success) throw new Error(login.message || 'Login failed');
  const token = login.token;
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const existing = await fetch(`${API}/api/stock`, { headers }).then(r => r.json());
  console.log(`Deleting ${existing.length} existing stock items…`);
  for (const item of existing) {
    const id = item.id;
    const del = await fetch(`${API}/api/stock/${id}`, { method: 'DELETE', headers });
    if (!del.ok) console.warn('Delete failed', id, await del.text());
  }

  const wb = XLSX.readFile(XLSX_PATH);
  const matrix = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  const norm = cell => String(cell || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const headerIdx = matrix.findIndex(row => {
    const cells = row.map(norm);
    return cells.some(c => c === 'code') && cells.some(c => c.includes('description'));
  });
  const headersRow = matrix[headerIdx];
  const col = name => headersRow.findIndex(h => norm(h) === norm(name));

  const codeIdx = col('Code');
  const descIdx = col('Description');
  const qtyIdx = col('Unposted');
  if (codeIdx < 0 || descIdx < 0) throw new Error('Could not find Code / Description columns');

  let added = 0, skipped = 0, failed = 0;
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const row = matrix[i];
    const stockNumber = String(row[codeIdx] || '').trim();
    const partDescription = String(row[descIdx] || '').trim();
    if (!stockNumber || /^total\b/i.test(stockNumber) || /inventory category/i.test(partDescription)) {
      skipped++;
      continue;
    }
    const qtyRaw = String(row[qtyIdx] ?? '0').replace(/[^\d-]/g, '');
    const quantity = parseInt(qtyRaw, 10) || 0;

    const payload = {
      stockNumber,
      partNumber: '',
      partDescription: partDescription || stockNumber,
      serialNumber: '',
      quantity,
      stockCategory: 'Production Inventory',
      storageLocation: '',
      trayBin: '',
      poNumber: '',
      jobNumber: '',
      jobCategory: ''
    };

    const res = await fetch(`${API}/api/stock`, { method: 'POST', headers, body: JSON.stringify(payload) });
    if (res.ok) {
      added++;
      if (added % 25 === 0) console.log(`  ${added} imported…`);
    } else {
      failed++;
      console.warn('Failed', stockNumber, await res.text());
    }
  }

  const withQty = await fetch(`${API}/api/stock`, { headers }).then(r => r.json());
  const qtyOnHand = withQty.filter(s => (s.quantity || 0) > 0).length;
  console.log(`Done. Added ${added}, skipped ${skipped}, failed ${failed}.`);
  console.log(`Database now has ${withQty.length} items (${qtyOnHand} with qty > 0).`);
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
