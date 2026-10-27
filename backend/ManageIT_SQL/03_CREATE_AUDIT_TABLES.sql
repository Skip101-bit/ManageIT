/* ================================================================
   MANAGEIT - 03 CREATE AUDIT TABLES
   ================================================================ */

USE ManageIT;
GO

-- ============================================================
-- USERS AUDIT LOG
-- ============================================================
IF OBJECT_ID('dbo.Users_AuditLog', 'U') IS NOT NULL DROP TABLE dbo.Users_AuditLog;
GO
CREATE TABLE dbo.Users_AuditLog (
    AuditID         INT IDENTITY(1,1) PRIMARY KEY,
    UserID          INT             NOT NULL,
    ActionType      CHAR(1)         NOT NULL,  -- C=Create, U=Update, D=Delete
    SALNumber       VARCHAR(20)     NULL,
    FullName        VARCHAR(100)    NULL,
    Role            VARCHAR(20)     NULL,
    Status          CHAR(1)         NULL,
    ChangedByUserID INT             NULL,
    ChangedDate     DATETIME        NOT NULL DEFAULT GETDATE()
);
GO

-- ============================================================
-- JOBS AUDIT LOG
-- ============================================================
IF OBJECT_ID('dbo.Jobs_AuditLog', 'U') IS NOT NULL DROP TABLE dbo.Jobs_AuditLog;
GO
CREATE TABLE dbo.Jobs_AuditLog (
    AuditID         INT IDENTITY(1,1) PRIMARY KEY,
    JobID           INT             NOT NULL,
    ActionType      CHAR(1)         NOT NULL,  -- C=Create, U=Update, D=Delete
    JobNumber       VARCHAR(30)     NULL,
    Description     VARCHAR(255)    NULL,
    Status          VARCHAR(20)     NULL,
    ChangedByUserID INT             NULL,
    ChangedDate     DATETIME        NOT NULL DEFAULT GETDATE()
);
GO

-- ============================================================
-- STOCK ITEMS AUDIT LOG
-- ============================================================
IF OBJECT_ID('dbo.StockItems_AuditLog', 'U') IS NOT NULL DROP TABLE dbo.StockItems_AuditLog;
GO
CREATE TABLE dbo.StockItems_AuditLog (
    AuditID         INT IDENTITY(1,1) PRIMARY KEY,
    StockID         INT             NOT NULL,
    ActionType      CHAR(1)         NOT NULL,  -- C=Create, U=Update, D=Delete
    StockNumber     VARCHAR(30)     NULL,
    Description     VARCHAR(255)    NULL,
    Quantity        INT             NULL,
    Status          VARCHAR(20)     NULL,
    ChangedByUserID INT             NULL,
    ChangedDate     DATETIME        NOT NULL DEFAULT GETDATE()
);
GO

-- ============================================================
-- STOCK TRANSACTIONS AUDIT LOG
-- ============================================================
IF OBJECT_ID('dbo.StockTransactions_AuditLog', 'U') IS NOT NULL DROP TABLE dbo.StockTransactions_AuditLog;
GO
CREATE TABLE dbo.StockTransactions_AuditLog (
    AuditID             INT IDENTITY(1,1) PRIMARY KEY,
    TransactionID       INT             NOT NULL,
    ActionType          CHAR(1)         NOT NULL,  -- C=Create, U=Update, D=Delete
    StockID             INT             NULL,
    TransactionType     VARCHAR(20)     NULL,
    QuantityChange      INT             NULL,
    ChangedByUserID     INT             NULL,
    ChangedDate         DATETIME        NOT NULL DEFAULT GETDATE()
);
GO
