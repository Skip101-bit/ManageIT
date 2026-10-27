/**
 * ManageIT — Professional Excel export (ExcelJS)
 */
'use strict';

const ManageITExcel = (() => {
  const NAVY        = 'FF0F2744';
  const NAVY_MID    = 'FF1E3A5F';
  const BLUE        = 'FF2563EB';
  const WHITE       = 'FFFFFFFF';
  const BORDER      = 'FFE2E8F0';
  const STRIPE      = 'FFF8FAFC';
  const MUTED       = 'FF64748B';

  const SCHEMAS = {
    stock: {
      sheet: 'Inventory',
      title: 'Inventory Register',
      filename: 'ManageIT_Inventory',
      columns: [
        { header: 'Inventory Number', key: 'stockNumber', width: 18 },
        { header: 'Part Number', key: 'partNumber', width: 16 },
        { header: 'Part Description', key: 'partDescription', width: 32 },
        { header: 'Serial Number', key: 'serialNumber', width: 16 },
        { header: 'Category', key: 'stockCategory', width: 20 },
        { header: 'Quantity', key: 'quantity', width: 12 },
        { header: 'Storage Location', key: 'storageLocation', width: 28 },
        { header: 'Tray / Bin', key: 'trayBin', width: 14 },
        { header: 'PO Number', key: 'poNumber', width: 16 },
        { header: 'Job Number', key: 'jobNumber', width: 14 },
        { header: 'Job Category', key: 'jobCategory', width: 22 },
        { header: 'Date Created', key: 'createdAt', width: 18, format: 'datetime' }
      ],
      rows: () => DB.stock
    },
    lowstock: {
      sheet: 'Low Inventory',
      title: 'Low Inventory Report',
      filename: 'ManageIT_Low_Inventory',
      columns: [
        { header: 'Inventory Number', key: 'stockNumber', width: 18 },
        { header: 'Part Description', key: 'partDescription', width: 32 },
        { header: 'Category', key: 'stockCategory', width: 20 },
        { header: 'Quantity', key: 'quantity', width: 12 },
        { header: 'Storage Location', key: 'storageLocation', width: 28 }
      ],
      rows: () => DB.stock.filter(s => s.quantity < (DB.settings.lowStockThreshold || 5))
    },
    countsheet: {
      sheet: 'Count Sheet',
      title: 'Physical Count Sheet',
      filename: 'ManageIT_Count_Sheet',
      columns: [
        { header: 'Inventory Number', key: 'stockNumber', width: 18 },
        { header: 'Part Number', key: 'partNumber', width: 16 },
        { header: 'Part Description', key: 'partDescription', width: 36 },
        { header: 'Category', key: 'stockCategory', width: 22 },
        { header: 'Storage Location', key: 'storageLocation', width: 28 },
        { header: 'Tray / Bin', key: 'trayBin', width: 14 },
        { header: 'Counted Qty', key: 'countedQty', width: 12 }
      ],
      // Never include master/system qty — counters must not see on-hand.
      rows: () => {
        if (typeof AuditWF !== 'undefined' && typeof AuditWF.getCountSheetRows === 'function') {
          const sessionRows = AuditWF.getCountSheetRows();
          if (sessionRows && sessionRows.length) return sessionRows;
        }
        return DB.stock
          .filter(s => (s.quantity || 0) > 0)
          .map(s => ({
            stockNumber: s.stockNumber,
            partNumber: s.partNumber || '',
            partDescription: s.partDescription || '',
            stockCategory: s.stockCategory || '',
            storageLocation: s.storageLocation || '',
            trayBin: s.trayBin || '',
            countedQty: ''
          }));
      }
    },
    jobs: {
      sheet: 'Jobs',
      title: 'Job Register',
      filename: 'ManageIT_Jobs',
      columns: [
        { header: 'Job Number', key: 'jobNumber', width: 16 },
        { header: 'Job Description', key: 'jobDescription', width: 36 },
        { header: 'Job Type', key: 'jobType', width: 12 },
        { header: 'Category', key: 'category', width: 24 },
        { header: 'Order Confirmation', key: 'orderConfirmation', width: 22 },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Date Created', key: 'createdAt', width: 18, format: 'datetime' }
      ],
      rows: () => DB.jobs
    },
    storage: {
      sheet:    'Storage Locations',
      title:    'Storage Locations',
      filename: 'ManageIT_Storage_Locations',
      columns: [
        { header: 'Location Name', key: 'name', width: 32 },
        { header: 'Description', key: 'description', width: 36 },
        { header: 'Building / Area', key: 'building', width: 22 },
        { header: 'Type', key: 'type', width: 14 }
      ],
      rows: () => DB.storageLocations
    },
    assets: {
      sheet:    'Assets',
      title:    'Fixed Asset Register',
      filename: 'ManageIT_Assets',
      columns: [
        { header: 'Asset Number', key: 'assetNumber', width: 16 },
        { header: 'Asset Name', key: 'assetName', width: 28 },
        { header: 'Category', key: 'category', width: 18 },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Condition', key: 'condition', width: 12 },
        { header: 'Serial Number', key: 'serialNumber', width: 16 },
        { header: 'Asset Tag', key: 'assetTag', width: 14 },
        { header: 'Location', key: 'storageLocation', width: 28 },
        { header: 'Job', key: 'jobNumber', width: 14 },
        { header: 'Assigned To', key: 'assignedTo', width: 18 },
        { header: 'Purchase Cost', key: 'purchaseCost', width: 14 },
        { header: 'Current Value', key: 'currentValue', width: 14 },
        { header: 'Warranty Expiry', key: 'warrantyExpiry', width: 14, format: 'date' },
        { header: 'Next Inspection', key: 'nextInspectionDue', width: 14, format: 'date' }
      ],
      rows: () => DB.assets || []
    },
    assetmaintenance: {
      sheet:      'Maintenance',
      title:      'Asset Maintenance Log',
      filename:   'ManageIT_Asset_Maintenance',
      columns: [
        { header: 'Asset Number', key: 'assetNumber', width: 16 },
        { header: 'Asset Name', key: 'assetName', width: 24 },
        { header: 'Type', key: 'maintenanceType', width: 14 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Scheduled', key: 'scheduledDate', width: 14, format: 'date' },
        { header: 'Completed', key: 'completedDate', width: 14, format: 'date' },
        { header: 'Vendor', key: 'vendor', width: 18 },
        { header: 'Cost', key: 'cost', width: 12 },
        { header: 'Next Due', key: 'nextDueDate', width: 14, format: 'date' },
        { header: 'Description', key: 'description', width: 32 }
      ],
      rows: () => DB.assetMaintenance || []
    },
    users: {
      sheet:      'Users',
      title:      'User Directory',
      filename:   'ManageIT_Users',
      columns: [
        { header: 'SAL Number', key: 'salNumber', width: 14 },
        { header: 'First Name', key: 'firstName', width: 16 },
        { header: 'Last Name', key: 'lastName', width: 16 },
        { header: 'Role', key: 'role', width: 18 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Date Created', key: 'createdAt', width: 18, format: 'datetime' }
      ],
      rows: () => DB.users.map(({ password, ...u }) => u)
    },
    transactions: {
      sheet:      'Transactions',
      title:      'Transaction History',
      filename:   'ManageIT_Transactions',
      columns: [
        { header: 'Date / Time', key: 'timestamp', width: 20, format: 'datetime' },
        { header: 'Type', key: 'type', width: 18 },
        { header: 'Inventory Number', key: 'stockNumber', width: 18 },
        { header: 'Part Description', key: 'partDescription', width: 30 },
        { header: 'Quantity', key: 'quantity', width: 12 },
        { header: 'Balance Before', key: 'qtyBefore', width: 14 },
        { header: 'Balance After', key: 'qtyAfter', width: 14 },
        { header: 'Location', key: 'storageLocation', width: 24 },
        { header: 'Job Number', key: 'jobNumber', width: 14 },
        { header: 'Comment', key: 'comment', width: 28 },
        { header: 'User', key: 'userName', width: 18 }
      ],
      rows: () => DB.transactions.map(t => ({
        ...t,
        type: t.type === 'Book In' ? 'Receipt' : t.type
      }))
    },
    activity: {
      sheet:      'Activity Log',
      title:      'User Activity Log',
      filename:   'ManageIT_Activity',
      columns: [
        { header: 'Timestamp', key: 'timestamp', width: 20, format: 'datetime' },
        { header: 'User', key: 'userName', width: 18 },
        { header: 'Action', key: 'actionPerformed', width: 16 },
        { header: 'Screen', key: 'screenVisited', width: 22 },
        { header: 'Description', key: 'activityDescription', width: 40 }
      ],
      rows: () => DB.activity
    }
  };

  const TEMPLATES = {
    stock: {
      sheet:    'Inventory Template',
      title:    'Inventory Import Template',
      filename: 'ManageIT_Inventory_Template',
      columns: SCHEMAS.stock.columns
    },
    jobs: {
      sheet:      'Jobs Template',
      title:      'Jobs Import Template',
      filename:   'ManageIT_Jobs_Template',
      columns: SCHEMAS.jobs.columns.filter(c => c.key !== 'createdAt')
    },
    users: {
      sheet:      'Users Template',
      title:      'Users Import Template',
      filename:   'ManageIT_Users_Template',
      columns: [
        { header: 'SAL Number', key: 'salNumber', width: 14 },
        { header: 'First Name', key: 'firstName', width: 16 },
        { header: 'Last Name', key: 'lastName', width: 16 },
        { header: 'Password', key: 'password', width: 16 },
        { header: 'Role', key: 'role', width: 18 },
        { header: 'Status', key: 'status', width: 12 }
      ]
    },
    storage: {
      sheet: 'Locations Template',
      title: 'Storage Locations Import Template',
      filename: 'ManageIT_Storage_Template',
      columns: SCHEMAS.storage.columns
    },
    assets: {
      sheet: 'Assets Template',
      title: 'Assets Import Template',
      filename: 'ManageIT_Assets_Template',
      columns: [
        { header: 'Asset Number', key: 'assetNumber', width: 16 },
        { header: 'Asset Name', key: 'assetName', width: 28 },
        { header: 'Description', key: 'description', width: 32 },
        { header: 'Category', key: 'category', width: 18 },
        { header: 'Manufacturer', key: 'manufacturer', width: 18 },
        { header: 'Model', key: 'model', width: 16 },
        { header: 'Serial Number', key: 'serialNumber', width: 16 },
        { header: 'Asset Tag', key: 'assetTag', width: 14 },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Condition', key: 'condition', width: 12 },
        { header: 'Location', key: 'storageLocation', width: 28 },
        { header: 'Job Number', key: 'jobNumber', width: 14 },
        { header: 'Assigned To', key: 'assignedTo', width: 18 },
        { header: 'Department', key: 'department', width: 16 },
        { header: 'Purchase Date', key: 'purchaseDate', width: 14 },
        { header: 'Purchase Cost', key: 'purchaseCost', width: 14 },
        { header: 'Current Value', key: 'currentValue', width: 14 },
        { header: 'Warranty Expiry', key: 'warrantyExpiry', width: 14 },
        { header: 'Next Inspection', key: 'nextInspectionDue', width: 14 }
      ]
    }
  };

  function companyName() {
    return (typeof DB !== 'undefined' && DB.settings?.company) || 'ManageIT';
  }

  function fmtCell(value, format) {
    if (value == null || value === '') return '';
    if (format === 'datetime') {
      if (typeof fmtDateTime === 'function') return fmtDateTime(value);
      try { return new Date(value).toLocaleString(); } catch (e) { return String(value); }
    }
    return value;
  }

  function thinBorder(color = BORDER) {
    return {
      top: { style: 'thin', color: { argb: color } },
      left: { style: 'thin', color: { argb: color } },
      bottom: { style: 'thin', color: { argb: color } },
      right: { style: 'thin', color: { argb: color } }
    };
  }

  function colLetter(n) {
    let s = '';
    while (n > 0) {
      const m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  function buildImportTemplateSheet(workbook, config, sampleRows) {
    const ws = workbook.addWorksheet(config.sheet.replace(' Template', ''), {
      views: [{ state: 'frozen', ySplit: 1 }],
      properties: { defaultRowHeight: 18 }
    });

    config.columns.forEach((col, i) => {
      const cell = ws.getCell(1, i + 1);
      cell.value = col.header;
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: WHITE } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
      cell.border = thinBorder('FF334155');
      ws.getColumn(i + 1).width = col.width || 16;
    });
    ws.getRow(1).height = 24;

    sampleRows.forEach((row, rowIdx) => {
      const excelRow = ws.getRow(rowIdx + 2);
      config.columns.forEach((col, colIdx) => {
        const cell = excelRow.getCell(colIdx + 1);
        cell.value = row[col.key] ?? '';
        cell.font = { name: 'Calibri', size: 10 };
        cell.border = thinBorder();
        if (rowIdx % 2 === 1) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STRIPE } };
        }
      });
    });

    if (config.columns.length) {
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: config.columns.length } };
    }
    return ws;
  }

  function buildSheet(workbook, config, dataRows, options = {}) {
    const ws = workbook.addWorksheet(config.sheet, {
      views: [{ state: 'frozen', ySplit: 5, xSplit: 0 }],
      properties: { defaultRowHeight: 18 }
    });

    const colCount = config.columns.length;
    const lastCol = colLetter(colCount);

    ws.mergeCells(`A1:${lastCol}1`);
    const titleCell = ws.getCell('A1');
    titleCell.value = companyName();
    titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: NAVY } };
    titleCell.alignment = { vertical: 'middle' };
    ws.getRow(1).height = 28;

    ws.mergeCells(`A2:${lastCol}2`);
    const subCell = ws.getCell('A2');
    subCell.value = config.title;
    subCell.font = { name: 'Calibri', size: 13, bold: true, color: { argb: NAVY_MID } };
    ws.getRow(2).height = 22;

    ws.mergeCells(`A3:${lastCol}3`);
    const metaCell = ws.getCell('A3');
    metaCell.value = `Generated ${new Date().toLocaleString()}  ·  ${dataRows.length} record${dataRows.length === 1 ? '' : 's'}`;
    metaCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: MUTED } };
    ws.getRow(3).height = 18;
    ws.getRow(4).height = 8;

    const headerRowNum = 5;
    config.columns.forEach((col, i) => {
      const cell = ws.getCell(headerRowNum, i + 1);
      cell.value = col.header;
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: WHITE } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
      cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      cell.border = thinBorder('FF334155');
      ws.getColumn(i + 1).width = col.width || 16;
    });
    ws.getRow(headerRowNum).height = 24;

    dataRows.forEach((row, rowIdx) => {
      const excelRow = ws.getRow(headerRowNum + 1 + rowIdx);
      config.columns.forEach((col, colIdx) => {
        const cell = excelRow.getCell(colIdx + 1);
        const raw = row[col.key];
        cell.value = fmtCell(raw, col.format);
        cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF0F172A' } };
        cell.alignment = { vertical: 'middle', wrapText: colIdx >= 2 };
        cell.border = thinBorder();
        if (rowIdx % 2 === 1) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STRIPE } };
        }
        if (col.format === 'datetime') cell.numFmt = 'yyyy-mm-dd hh:mm';
        if (col.key === 'quantity' || col.key === 'qtyBefore' || col.key === 'qtyAfter') {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        }
      });
      excelRow.height = 20;
    });

    if (dataRows.length) {
      ws.autoFilter = {
        from: { row: headerRowNum, column: 1 },
        to: { row: headerRowNum, column: config.columns.length }
      };
    }

    if (options.instructions) {
      const noteCol = config.columns.length + 2;
      ws.getCell(1, noteCol).value = 'Instructions';
      ws.getCell(1, noteCol).font = { bold: true, color: { argb: NAVY } };
      options.instructions.forEach((line, i) => {
        ws.getCell(2 + i, noteCol).value = line;
        ws.getCell(2 + i, noteCol).font = { size: 9, color: { argb: MUTED } };
      });
      ws.getColumn(noteCol).width = 42;
    }

    return ws;
  }

  async function downloadWorkbook(workbook, filename) {
    if (typeof ExcelJS === 'undefined') throw new Error('Excel library not loaded');
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function exportExcel(type) {
    const assetTypes = ['assets', 'assetmaintenance'];
    if (typeof ManageITPerms !== 'undefined') {
      if (assetTypes.includes(type)) {
        if (!ManageITPerms.canView('AssetManagement')) {
          toast('You do not have permission to export assets.', 'error');
          return;
        }
      } else if (!ManageITPerms.canView('ExportReports')) {
        toast('You do not have permission to export reports.', 'error');
        return;
      }
    }
    if (typeof ExcelJS === 'undefined') {
      toast('Excel export library not loaded', 'error');
      return;
    }

    let schemaKey = type;
    if (type === 'bookins') schemaKey = 'transactions';
    if (type === 'bookouts') schemaKey = 'transactions';

    const schema = SCHEMAS[schemaKey];
    if (!schema) {
      toast('Unknown export type', 'error');
      return;
    }

    let rows = schema.rows();
    if (type === 'bookins') rows = rows.filter(t => t.type === 'Receipt' || t.type === 'Book In');
    if (type === 'bookouts') rows = rows.filter(t => t.type === 'Book Out');
    if (type === 'countsheet' && !rows.length) {
      toast('No inventory items with quantity on hand to export', 'warning');
      return;
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = companyName();
    workbook.created = new Date();
    buildSheet(workbook, schema, rows);

    await downloadWorkbook(workbook, schema.filename);
    toast(`Exported ${schema.filename}.xlsx`, 'success');
    if (typeof DB !== 'undefined' && typeof currentUser !== 'undefined' && currentUser) {
      DB.logActivity(currentUser.firstName + ' ' + currentUser.lastName, 'Export', 'Exports', `Exported ${schema.filename}.xlsx`);
    }
  }

  async function exportAllExcel() {
    if (typeof ManageITPerms !== 'undefined' && !ManageITPerms.canView('ExportReports')) {
      toast('You do not have permission to export reports.', 'error');
      return;
    }
    if (typeof ExcelJS === 'undefined') {
      toast('Excel export library not loaded', 'error');
      return;
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = companyName();
    workbook.created = new Date();

    const summary = workbook.addWorksheet('Summary', { views: [{ showGridLines: false }] });
    summary.getColumn(1).width = 28;
    summary.getColumn(2).width = 40;
    summary.mergeCells('A1:B1');
    summary.getCell('A1').value = companyName();
    summary.getCell('A1').font = { size: 18, bold: true, color: { argb: NAVY } };
    summary.getCell('A3').value = 'ManageIT Data Export';
    summary.getCell('A3').font = { size: 14, bold: true, color: { argb: NAVY_MID } };
    summary.getCell('A4').value = `Exported ${new Date().toLocaleString()}`;
    summary.getCell('A4').font = { size: 10, italic: true, color: { argb: MUTED } };
    const counts = [
      ['Inventory items', DB.stock.length],
      ['Jobs', DB.jobs.length],
      ['Storage locations', DB.storageLocations.length],
      ['Users', DB.users.length],
      ['Transactions', DB.transactions.length],
      ['Activity records', DB.activity.length]
    ];
    counts.forEach((row, i) => {
      summary.getCell(6 + i, 1).value = row[0];
      summary.getCell(6 + i, 1).font = { bold: true };
      summary.getCell(6 + i, 2).value = row[1];
    });

    ['stock', 'jobs', 'storage', 'users', 'transactions', 'activity'].forEach(key => {
      buildSheet(workbook, SCHEMAS[key], SCHEMAS[key].rows());
    });

    await downloadWorkbook(workbook, 'ManageIT_Full_Export');
    toast('Full Excel export downloaded', 'success');
  }

  async function downloadTemplate(type) {
    if (typeof ExcelJS === 'undefined') {
      toast('Excel library not loaded — using CSV template', 'warning');
      return false;
    }
    const tpl = TEMPLATES[type];
    if (!tpl) return false;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = companyName();
    buildImportTemplateSheet(workbook, tpl, []);

    await downloadWorkbook(workbook, tpl.filename);
    toast('Download Template — column headings only, ready to fill in', 'info');
    return true;
  }

  return { exportExcel, exportAllExcel, downloadTemplate, buildSheet, buildImportTemplateSheet, downloadWorkbook, SCHEMAS };
})();

window.exportExcel = (type) => ManageITExcel.exportExcel(type);
window.exportAllExcel = () => ManageITExcel.exportAllExcel();
