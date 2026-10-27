/* ================================================================
   MANAGEIT - 09 RBAC & PENDING APPROVALS
   Run after scripts 07/08 on database ManageIT
   ================================================================ */

USE ManageIT;
GO

-- Widen Role column for new role codes
IF COL_LENGTH('dbo.Users', 'Role') IS NOT NULL
BEGIN
    ALTER TABLE dbo.Users ALTER COLUMN Role VARCHAR(30) NOT NULL;
END
GO

-- Reference tables (optional — matrix is enforced in API; stored for reporting)
IF OBJECT_ID('dbo.Roles', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Roles (
        RoleCode     VARCHAR(30)  NOT NULL PRIMARY KEY,
        RoleName     VARCHAR(100) NOT NULL,
        Description  VARCHAR(500) NULL
    );
END
GO

IF OBJECT_ID('dbo.PermissionFunctions', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.PermissionFunctions (
        FunctionCode VARCHAR(50)  NOT NULL PRIMARY KEY,
        DisplayName  VARCHAR(100) NOT NULL,
        Category     VARCHAR(50)  NULL
    );
END
GO

IF OBJECT_ID('dbo.RolePermissions', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.RolePermissions (
        RoleCode     VARCHAR(30) NOT NULL,
        FunctionCode VARCHAR(50) NOT NULL,
        AccessLevel  VARCHAR(20) NOT NULL,
        CONSTRAINT PK_RolePermissions PRIMARY KEY (RoleCode, FunctionCode),
        CONSTRAINT FK_RolePermissions_Role FOREIGN KEY (RoleCode) REFERENCES dbo.Roles(RoleCode),
        CONSTRAINT FK_RolePermissions_Function FOREIGN KEY (FunctionCode) REFERENCES dbo.PermissionFunctions(FunctionCode)
    );
END
GO

-- Pending approval workflow (adjustments, stock take variances, audit adjustments)
IF OBJECT_ID('dbo.PendingApprovals', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.PendingApprovals (
        ApprovalID        INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        ApprovalType      VARCHAR(30)  NOT NULL,
        Status            VARCHAR(20)  NOT NULL DEFAULT 'Pending',
        StockNumber       VARCHAR(50)  NULL,
        Description       VARCHAR(500) NULL,
        QuantityChange    INT          NULL,
        PayloadJson       NVARCHAR(MAX) NULL,
        RequestedByUserID INT          NULL,
        ApprovedByUserID  INT          NULL,
        RequestedAt       DATETIME2    NOT NULL DEFAULT GETDATE(),
        ResolvedAt        DATETIME2    NULL,
        Notes             VARCHAR(500) NULL
    );
END
GO

-- Seed roles
MERGE dbo.Roles AS t
USING (VALUES
    ('Admin',          'Admin',           'System setup, user management, security, all permissions'),
    ('StockCapturer',  'Stock Capturer',  'Capture receipts, issues, transfers, create new stock'),
    ('Approver',       'Approver',        'Authorize transactions, adjustments, transfers, stock takes'),
    ('StoreManager',   'Store Manager',   'Warehouse operations, oversee movement, monitor inventory'),
    ('Auditor',        'Auditor',         'Verify counts, audits, review history, authorize audit adjustments'),
    ('Viewer',         'Viewer',          'Read-only inventory and reports')
) AS s(RoleCode, RoleName, Description)
ON t.RoleCode = s.RoleCode
WHEN NOT MATCHED THEN INSERT (RoleCode, RoleName, Description) VALUES (s.RoleCode, s.RoleName, s.Description);
GO

PRINT 'RBAC tables and PendingApprovals ready.';
GO
