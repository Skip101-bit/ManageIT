/* ================================================================
   MANAGEIT - 10 INVENTORY PORTAL & MULTI-COUNT WORKFLOW
   Run after 09_RBAC_PERMISSIONS.sql on database ManageIT
   ================================================================ */

USE ManageIT;
GO

-- Widen transaction type for Receipt, Relocation, Transfer (Reverse), etc.
IF COL_LENGTH('dbo.StockTransactions', 'TransactionType') IS NOT NULL
BEGIN
    ALTER TABLE dbo.StockTransactions ALTER COLUMN TransactionType VARCHAR(60) NOT NULL;
END
GO

IF COL_LENGTH('dbo.StockTransactions_AuditLog', 'TransactionType') IS NOT NULL
BEGIN
    ALTER TABLE dbo.StockTransactions_AuditLog ALTER COLUMN TransactionType VARCHAR(60) NULL;
END
GO

-- Multi-count audit sessions (full session JSON from Stock-IT portal)
IF OBJECT_ID('dbo.AuditSessions', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AuditSessions (
        SessionID    VARCHAR(50)   NOT NULL PRIMARY KEY,
        SessionName  NVARCHAR(200) NOT NULL,
        Status       VARCHAR(50)   NOT NULL DEFAULT 'count1_in_progress',
        CreatedAt    DATETIME      NOT NULL DEFAULT GETDATE(),
        CreatedBy    NVARCHAR(200) NULL,
        PayloadJson  NVARCHAR(MAX) NOT NULL,
        UpdatedAt    DATETIME      NOT NULL DEFAULT GETDATE()
    );
    CREATE INDEX IX_AuditSessions_CreatedAt ON dbo.AuditSessions (CreatedAt DESC);
END
GO

-- Reconciliation history runs (multi-count recon reports)
IF OBJECT_ID('dbo.ReconHistoryRuns', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ReconHistoryRuns (
        RunID        VARCHAR(50)   NOT NULL PRIMARY KEY,
        SessionID    VARCHAR(50)   NOT NULL,
        CountNumber  INT           NOT NULL,
        RunAt        DATETIME      NOT NULL DEFAULT GETDATE(),
        RunBy        NVARCHAR(200) NULL,
        Status       VARCHAR(30)   NOT NULL DEFAULT 'complete',
        PayloadJson  NVARCHAR(MAX) NOT NULL
    );
    CREATE INDEX IX_ReconHistoryRuns_Session ON dbo.ReconHistoryRuns (SessionID, CountNumber);
END
GO

-- User-added serial numbers (Inventory Transactions dropdown)
IF OBJECT_ID('dbo.InventorySerialNumbers', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.InventorySerialNumbers (
        SerialNumber VARCHAR(100) NOT NULL PRIMARY KEY,
        CreatedAt    DATETIME     NOT NULL DEFAULT GETDATE()
    );
END
GO

-- Optional: migrate legacy Book In labels in history to Receipt
UPDATE dbo.StockTransactions SET TransactionType = 'Receipt' WHERE TransactionType = 'Book In';
GO

PRINT 'Inventory portal tables and transaction type migration complete.';
GO
