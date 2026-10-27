/* ================================================================
   MANAGEIT - 02 CREATE TABLES
   ================================================================ */

USE ManageIT;
GO

-- ============================================================
-- DEPARTMENTS
-- ============================================================
IF OBJECT_ID('dbo.Departments', 'U') IS NOT NULL DROP TABLE dbo.Departments;
GO
CREATE TABLE dbo.Departments (
    DepartmentID    INT IDENTITY(1,1) PRIMARY KEY,
    DepartmentName  VARCHAR(100)    NOT NULL UNIQUE,
    Status          CHAR(1)         NOT NULL DEFAULT 'A',  -- A=Active, I=Inactive
    CreatedDate     DATETIME        NOT NULL DEFAULT GETDATE(),
    ModifiedDate    DATETIME        NULL
);
GO

-- ============================================================
-- USERS
-- ============================================================
IF OBJECT_ID('dbo.Users', 'U') IS NOT NULL DROP TABLE dbo.Users;
GO
CREATE TABLE dbo.Users (
    UserID          INT IDENTITY(1,1) PRIMARY KEY,
    SALNumber       VARCHAR(20)     NOT NULL UNIQUE,   -- employee/login number
    FullName        VARCHAR(100)    NOT NULL,
    Email           VARCHAR(150)    NULL,
    PasswordHash    VARCHAR(255)    NOT NULL,
    Role            VARCHAR(20)     NOT NULL DEFAULT 'User',  -- 'Admin' or 'User'
    DepartmentID    INT             NULL,
    Status          CHAR(1)         NOT NULL DEFAULT 'A',  -- A=Active, I=Inactive, B=Blocked
    CanAccessLms    BIT             NOT NULL DEFAULT 0,   -- 1 = may use LMS login / Scope of Work
    LastLogin       DATETIME        NULL,
    CreatedDate     DATETIME        NOT NULL DEFAULT GETDATE(),
    ModifiedDate    DATETIME        NULL,
    CONSTRAINT FK_Users_Department FOREIGN KEY (DepartmentID)
        REFERENCES dbo.Departments(DepartmentID)
);
GO

-- ============================================================
-- STORAGE LOCATIONS
-- ============================================================
IF OBJECT_ID('dbo.StorageLocations', 'U') IS NOT NULL DROP TABLE dbo.StorageLocations;
GO
CREATE TABLE dbo.StorageLocations (
    LocationID      INT IDENTITY(1,1) PRIMARY KEY,
    LocationCode    VARCHAR(20)     NOT NULL UNIQUE,   -- e.g. LOC-001
    LocationName    VARCHAR(100)    NOT NULL,          -- e.g. Rack A-1
    LocationType    VARCHAR(50)     NOT NULL,          -- Rack, Shelf, Cabinet, Room
    Capacity        INT             NOT NULL DEFAULT 0,
    UsedCapacity    INT             NOT NULL DEFAULT 0,
    CreatedDate     DATETIME        NOT NULL DEFAULT GETDATE(),
    ModifiedDate    DATETIME        NULL
);
GO

-- ============================================================
-- JOBS
-- ============================================================
IF OBJECT_ID('dbo.Jobs', 'U') IS NOT NULL DROP TABLE dbo.Jobs;
GO
CREATE TABLE dbo.Jobs (
    JobID                   INT IDENTITY(1,1) PRIMARY KEY,
    JobNumber               VARCHAR(30)     NOT NULL UNIQUE,  -- e.g. JOB-001
    JobType                 CHAR(1)         NULL,             -- A-R/W range per spec
    Description             VARCHAR(255)    NULL,
    OrderConfirmation       VARCHAR(100)    NULL,
    Category                VARCHAR(50)     NULL,
    Status                  VARCHAR(20)     NOT NULL DEFAULT 'Active', -- Active, On Hold, Completed, Cancelled
    DepartmentID            INT             NULL,
    AssignedUserID          INT             NULL,
    CreatedDate             DATETIME        NOT NULL DEFAULT GETDATE(),
    ModifiedDate            DATETIME        NULL,
    CONSTRAINT FK_Jobs_Department FOREIGN KEY (DepartmentID)
        REFERENCES dbo.Departments(DepartmentID),
    CONSTRAINT FK_Jobs_AssignedUser FOREIGN KEY (AssignedUserID)
        REFERENCES dbo.Users(UserID)
);
GO

-- ============================================================
-- STOCK ITEMS
-- ============================================================
IF OBJECT_ID('dbo.StockItems', 'U') IS NOT NULL DROP TABLE dbo.StockItems;
GO
CREATE TABLE dbo.StockItems (
    StockID         INT IDENTITY(1,1) PRIMARY KEY,
    StockNumber     VARCHAR(30)     NOT NULL UNIQUE,
    PartNumber      VARCHAR(50)     NULL,
    SerialNumber    VARCHAR(50)     NULL,
    Description     VARCHAR(255)    NULL,
    Quantity        INT             NOT NULL DEFAULT 0,
    PONumber        VARCHAR(50)     NULL,
    StockType       VARCHAR(30)     NOT NULL DEFAULT 'Production Inventory', -- Production Inventory, Service Inventory, Legacy Inventory
    LocationID       INT             NULL,
    TrayBin          VARCHAR(50)     NULL,
    JobID           INT             NULL,                       -- set when StockType = 'Job'
    Status          VARCHAR(20)     NOT NULL DEFAULT 'In Stock', -- In Stock, Low Stock, Out of Stock
    CreatedDate     DATETIME        NOT NULL DEFAULT GETDATE(),
    ModifiedDate    DATETIME        NULL,
    CONSTRAINT FK_StockItems_Location FOREIGN KEY (LocationID)
        REFERENCES dbo.StorageLocations(LocationID),
    CONSTRAINT FK_StockItems_Job FOREIGN KEY (JobID)
        REFERENCES dbo.Jobs(JobID)
);
GO

-- ============================================================
-- STOCK TRANSACTIONS  (Book In / Book Out / Transfer history)
-- ============================================================
IF OBJECT_ID('dbo.StockTransactions', 'U') IS NOT NULL DROP TABLE dbo.StockTransactions;
GO
CREATE TABLE dbo.StockTransactions (
    TransactionID       INT IDENTITY(1,1) PRIMARY KEY,
    StockID             INT             NOT NULL,
    TransactionType     VARCHAR(20)     NOT NULL,  -- 'Book In', 'Book Out', 'Transfer'
    QuantityChange      INT             NOT NULL,  -- + for in, - for out
    QuantityBefore      INT             NOT NULL,
    QuantityAfter       INT             NOT NULL,
    FromJobID           INT             NULL,
    ToJobID             INT             NULL,
    FromLocationID      INT             NULL,
    ToLocationID        INT             NULL,
    PerformedByUserID   INT             NOT NULL,
    Notes               VARCHAR(255)    NULL,
    TransactionDate     DATETIME        NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_StockTransactions_Stock FOREIGN KEY (StockID)
        REFERENCES dbo.StockItems(StockID),
    CONSTRAINT FK_StockTransactions_FromJob FOREIGN KEY (FromJobID)
        REFERENCES dbo.Jobs(JobID),
    CONSTRAINT FK_StockTransactions_ToJob FOREIGN KEY (ToJobID)
        REFERENCES dbo.Jobs(JobID),
    CONSTRAINT FK_StockTransactions_FromLocation FOREIGN KEY (FromLocationID)
        REFERENCES dbo.StorageLocations(LocationID),
    CONSTRAINT FK_StockTransactions_ToLocation FOREIGN KEY (ToLocationID)
        REFERENCES dbo.StorageLocations(LocationID),
    CONSTRAINT FK_StockTransactions_User FOREIGN KEY (PerformedByUserID)
        REFERENCES dbo.Users(UserID)
);
GO

-- ============================================================
-- ACTIVITY LOG
-- ============================================================
IF OBJECT_ID('dbo.ActivityLog', 'U') IS NOT NULL DROP TABLE dbo.ActivityLog;
GO
CREATE TABLE dbo.ActivityLog (
    ActivityID      INT IDENTITY(1,1) PRIMARY KEY,
    UserID          INT             NULL,
    ActivityType    VARCHAR(20)     NOT NULL,  -- 'login', 'logout', 'stock', 'job', etc.
    ActionText      VARCHAR(255)    NOT NULL,
    ActivityDate    DATETIME        NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_ActivityLog_User FOREIGN KEY (UserID)
        REFERENCES dbo.Users(UserID)
);
GO

-- ============================================================
-- SETTINGS (key/value app config)
-- ============================================================
IF OBJECT_ID('dbo.Settings', 'U') IS NOT NULL DROP TABLE dbo.Settings;
GO
CREATE TABLE dbo.Settings (
    SettingID       INT IDENTITY(1,1) PRIMARY KEY,
    SettingKey      VARCHAR(100)    NOT NULL UNIQUE,
    SettingValue    VARCHAR(255)    NULL,
    ModifiedDate    DATETIME        NULL DEFAULT GETDATE()
);
GO
