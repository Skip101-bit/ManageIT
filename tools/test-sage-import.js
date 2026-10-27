'use strict';
const path = require('path');
const fs = require('fs');
const xlsxDir = path.join(__dirname, 'xlsx-import');
const XLSX = require(path.join(xlsxDir, 'node_modules', 'xlsx'));

// Copy of parse/autoDetect from app.js for testing
function parseSpreadsheetSheet(sheet) {
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!matrix.length) return { rows: [], headers: [], headerRowIndex: 0 };
  const norm = cell => String(cell || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const headerKeywords = ['code', 'description', 'desc', 'unposted', 'onhand', 'quantity', 'qty', 'group', 'unit', 'cost', 'value'];
  let headerIdx = -1, bestScore = 0;
  matrix.forEach((row, i) => {
    const cells = row.map(norm).filter(Boolean);
    if (!cells.length) return;
    const hasCode = cells.some(c => c === 'code' || c === 'stocknumber' || c === 'inventorynumber');
    const hasDesc = cells.some(c => c.includes('description') || c === 'desc');
    const score = cells.filter(c => headerKeywords.some(k => c === k || c.includes(k))).length;
    if (hasCode && hasDesc && score > bestScore) { bestScore = score; headerIdx = i; }
  });
  if (headerIdx < 0) headerIdx = 0;
  const headers = matrix[headerIdx].map((h, i) => String(h || '').trim() || `Column_${i + 1}`);
  const rows = [];
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const obj = {};
    headers.forEach((h, j) => { obj[h] = matrix[i][j] ?? ''; });
    if (Object.values(obj).every(v => String(v ?? '').trim() === '')) continue;
    rows.push(obj);
  }
  return { rows, headers, headerRowIndex: headerIdx };
}

const file = process.argv[2];
if (!file || !fs.existsSync(file)) {
  console.error('File not found:', file);
  process.exit(1);
}
const wb = XLSX.readFile(file);
const parsed = parseSpreadsheetSheet(wb.Sheets[wb.SheetNames[0]]);
console.log('headerRow', parsed.headerRowIndex + 1);
console.log('headers', parsed.headers);
console.log('rows', parsed.rows.length);
console.log('sample', parsed.rows.slice(0, 3));
