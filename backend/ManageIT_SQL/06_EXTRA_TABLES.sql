/* ================================================================
   MANAGEIT - 06 EXTRA TABLES (Audits & Reconciliations)
   Run after 02_CREATE_TABLES.sql
   ================================================================ */

USE ManageIT;
GO

IF OBJECT_ID('dbo.InventoryAudits', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.InventoryAudits (
        AuditID         INT IDENTITY(1,1) PRIMARY KEY,
        AuditDate       DATETIME        NOT NULL DEFAULT GETDATE(),
        StockNumber     VARCHAR(30)     NOT NULL,
        PartDescription VARCHAR(255)    NULL,
        SystemQty       INT             NOT NULL DEFAULT 0,
        AuditedQty      INT             NOT NULL DEFAULT 0,
        Result          VARCHAR(20)     NOT NULL,
        AuditedBy       VARCHAR(100)    NOT NULL
    );
END
GO

IF OBJECT_ID('dbo.Reconciliations', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Reconciliations (
        ReconciliationID INT IDENTITY(1,1) PRIMARY KEY,
        StockNumber      VARCHAR(30)     NOT NULL,
        PartDescription  VARCHAR(255)    NULL,
        SystemQty        INT             NOT NULL DEFAULT 0,
        PhysicalQty      INT             NOT NULL DEFAULT 0,
        Variance         INT             NOT NULL DEFAULT 0,
        Status           VARCHAR(20)     NOT NULL DEFAULT 'Pending',
        ReconciledAt     DATETIME        NULL DEFAULT GETDATE()
    );
END
GO

PRINT 'Extra tables created.';
GO
