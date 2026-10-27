/* ================================================================
   MANAGEIT - 05 SEED DATA (aligned with ERP frontend demo)
   ================================================================ */

USE ManageIT;
GO

-- Clear existing seed-friendly data (order matters for FKs)
DELETE FROM dbo.StockTransactions;
DELETE FROM dbo.ActivityLog;
DELETE FROM dbo.StockItems;
DELETE FROM dbo.Jobs;
DELETE FROM dbo.StorageLocations;
DELETE FROM dbo.Users;
DELETE FROM dbo.Departments;
GO

-- ============================================================
-- DEPARTMENTS
-- ============================================================
INSERT INTO dbo.Departments (DepartmentName, Status) VALUES
('Operations', 'A'),
('Warehouse', 'A'),
('Production', 'A'),
('Service', 'A');
GO

-- ============================================================
-- USERS
-- PasswordHash 'demo' works with admin123 / pass123 / pass456 via API
-- ============================================================
INSERT INTO dbo.Users (SALNumber, FullName, Email, PasswordHash, Role, DepartmentID, Status) VALUES
('10001', 'Admin User',      'admin@manageit.co.za',  'demo', 'Admin',         1, 'A'),
('10002', 'John Smith',      'john@manageit.co.za',   'demo', 'StockCapturer', 2, 'A'),
('10003', 'Sarah Johnson',   'sarah@manageit.co.za',  'demo', 'Approver',      2, 'A'),
('10004', 'Mike Williams',   'mike@manageit.co.za',   'demo', 'StoreManager',  2, 'A'),
('10005', 'Lisa Brown',      'lisa@manageit.co.za',   'demo', 'Auditor',       2, 'A'),
('10006', 'Tom Davis',       'tom@manageit.co.za',    'demo', 'Viewer',        2, 'A');
GO

-- ============================================================
-- STORAGE LOCATIONS (matches frontend DEFAULT_STORAGE_LOCATIONS)
-- ============================================================
INSERT INTO dbo.StorageLocations (LocationCode, LocationName, LocationType, Capacity, UsedCapacity) VALUES
('LOC-001', 'Production Hanel 1 (105 Workshop)',              'Hanel', 200, 45),
('LOC-002', 'Production Hanel 2 (105 Workshop)',              'Hanel', 200, 30),
('LOC-003', 'Production Workshop Shelves (105 Workshop)',     'Shelf', 500, 120),
('LOC-004', 'Production Stock Pending Valuation',             'Other', 100, 10),
('LOC-005', 'Roboware Hanel 1 (107 Workshop)',                'Hanel', 150, 25),
('LOC-006', 'Service Stock Storage (107 Storage)',            'Other', 300, 80),
('LOC-007', 'Service Stock Pending Valuation (107 Storage)',  'Other', 100, 5);
GO

-- ============================================================
-- JOBS
-- ============================================================
INSERT INTO dbo.Jobs (JobNumber, JobType, Description, OrderConfirmation, Category, Status, DepartmentID, AssignedUserID) VALUES
('JOB-001', 'A', 'Racking Installation - Site A',       'OC-2024-001', 'Production Inventory', 'Active',  1, 2),
('JOB-002', 'B', 'Service & Maintenance - Warehouse B', 'OC-2024-002', 'Service Inventory',    'Active',  2, 3),
('JOB-003', 'C', 'Vertical Storage Project',            'OC-2024-003', 'Production Inventory', 'On Hold', 1, 2);
GO

-- ============================================================
-- STOCK ITEMS
-- ============================================================
INSERT INTO dbo.StockItems (StockNumber, PartNumber, SerialNumber, Description, Quantity, PONumber, StockType, LocationID, TrayBin, JobID, Status) VALUES
('STK-001', 'PN-4512', '',           'Steel Bracket 200mm',    45, 'PO-2024-001', 'Production Inventory', 1, 'A1', NULL, 'In Stock'),
('STK-002', 'PN-7834', 'SN-001234',  'Drive Belt Assembly',     3, 'PO-2024-002', 'Service Inventory', 6, 'B2', NULL, 'Low Stock'),
('STK-003', 'PN-1122', 'SN-CP-001',  'Control Panel Unit',      2, 'PO-2024-003', 'Production Inventory', 5, 'C1', 1,    'Low Stock'),
('STK-004', 'PN-9900', '',           'Hydraulic Seal Kit',     12, 'PO-2024-004', 'Service Inventory', 6, 'B4', NULL, 'In Stock'),
('STK-005', 'PN-3300', 'SN-MTR-007', 'Motor 1.5kW',             1, 'PO-2024-005', 'Production Inventory', 3, 'D3', NULL, 'Low Stock');
GO

-- ============================================================
-- STOCK TRANSACTIONS
-- ============================================================
INSERT INTO dbo.StockTransactions (StockID, TransactionType, QuantityChange, QuantityBefore, QuantityAfter, FromJobID, ToJobID, FromLocationID, ToLocationID, PerformedByUserID, Notes) VALUES
(1, 'Book In',  45,  0, 45, NULL, NULL, NULL, 1, 1, 'Initial stock receipt'),
(2, 'Book In',   3,  0,  3, NULL, NULL, NULL, 6, 1, 'Initial stock receipt'),
(3, 'Transfer',  2,  0,  2, NULL, 1,    5,    5, 2, 'Allocated to JOB-001'),
(4, 'Book In',  12,  0, 12, NULL, NULL, NULL, 6, 1, 'Initial stock receipt'),
(5, 'Book In',   1,  0,  1, NULL, NULL, NULL, 3, 1, 'Initial stock receipt');
GO

-- ============================================================
-- ACTIVITY LOG
-- ============================================================
INSERT INTO dbo.ActivityLog (UserID, ActivityType, ActionText) VALUES
(1, 'login',  'Login: ManageIT initialized with demo data'),
(2, 'login',  'Login: User logged in successfully'),
(1, 'stock',  'General Stock Management: Added stock STK-001');
GO

-- ============================================================
-- SETTINGS
-- ============================================================
DELETE FROM dbo.Settings;
INSERT INTO dbo.Settings (SettingKey, SettingValue) VALUES
('CompanyName', 'Storage Management Systems (PTY) Ltd'),
('LowStockThreshold', '5'),
('LowStockAlert', '1'),
('ActivityLog', '1'),
('AppVersion', '1.1.0');
GO
