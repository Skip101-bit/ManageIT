/* ================================================================
   MANAGEIT - 04 CREATE TRIGGERS
   Audit triggers for Users, Jobs, StockItems, StockTransactions
   ================================================================ */

USE ManageIT;
GO

-- ============================================================
-- USERS TRIGGERS
-- ============================================================
IF OBJECT_ID('dbo.trg_Users_Insert', 'TR') IS NOT NULL DROP TRIGGER dbo.trg_Users_Insert;
GO
CREATE TRIGGER dbo.trg_Users_Insert
ON dbo.Users
AFTER INSERT
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.Users_AuditLog (UserID, ActionType, SALNumber, FullName, Role, Status, ChangedByUserID)
    SELECT UserID, 'C', SALNumber, FullName, Role, Status, NULL
    FROM inserted;
END
GO

IF OBJECT_ID('dbo.trg_Users_Update', 'TR') IS NOT NULL DROP TRIGGER dbo.trg_Users_Update;
GO
CREATE TRIGGER dbo.trg_Users_Update
ON dbo.Users
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.Users_AuditLog (UserID, ActionType, SALNumber, FullName, Role, Status, ChangedByUserID)
    SELECT UserID, 'U', SALNumber, FullName, Role, Status, NULL
    FROM inserted;
END
GO

IF OBJECT_ID('dbo.trg_Users_Delete', 'TR') IS NOT NULL DROP TRIGGER dbo.trg_Users_Delete;
GO
CREATE TRIGGER dbo.trg_Users_Delete
ON dbo.Users
AFTER DELETE
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.Users_AuditLog (UserID, ActionType, SALNumber, FullName, Role, Status, ChangedByUserID)
    SELECT UserID, 'D', SALNumber, FullName, Role, Status, NULL
    FROM deleted;
END
GO

-- ============================================================
-- JOBS TRIGGERS
-- ============================================================
IF OBJECT_ID('dbo.trg_Jobs_Insert', 'TR') IS NOT NULL DROP TRIGGER dbo.trg_Jobs_Insert;
GO
CREATE TRIGGER dbo.trg_Jobs_Insert
ON dbo.Jobs
AFTER INSERT
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.Jobs_AuditLog (JobID, ActionType, JobNumber, Description, Status, ChangedByUserID)
    SELECT JobID, 'C', JobNumber, Description, Status, AssignedUserID
    FROM inserted;
END
GO

IF OBJECT_ID('dbo.trg_Jobs_Update', 'TR') IS NOT NULL DROP TRIGGER dbo.trg_Jobs_Update;
GO
CREATE TRIGGER dbo.trg_Jobs_Update
ON dbo.Jobs
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.Jobs_AuditLog (JobID, ActionType, JobNumber, Description, Status, ChangedByUserID)
    SELECT JobID, 'U', JobNumber, Description, Status, AssignedUserID
    FROM inserted;
END
GO

IF OBJECT_ID('dbo.trg_Jobs_Delete', 'TR') IS NOT NULL DROP TRIGGER dbo.trg_Jobs_Delete;
GO
CREATE TRIGGER dbo.trg_Jobs_Delete
ON dbo.Jobs
AFTER DELETE
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.Jobs_AuditLog (JobID, ActionType, JobNumber, Description, Status, ChangedByUserID)
    SELECT JobID, 'D', JobNumber, Description, Status, AssignedUserID
    FROM deleted;
END
GO

-- ============================================================
-- STOCK ITEMS TRIGGERS
-- ============================================================
IF OBJECT_ID('dbo.trg_StockItems_Insert', 'TR') IS NOT NULL DROP TRIGGER dbo.trg_StockItems_Insert;
GO
CREATE TRIGGER dbo.trg_StockItems_Insert
ON dbo.StockItems
AFTER INSERT
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.StockItems_AuditLog (StockID, ActionType, StockNumber, Description, Quantity, Status, ChangedByUserID)
    SELECT StockID, 'C', StockNumber, Description, Quantity, Status, NULL
    FROM inserted;
END
GO

IF OBJECT_ID('dbo.trg_StockItems_Update', 'TR') IS NOT NULL DROP TRIGGER dbo.trg_StockItems_Update;
GO
CREATE TRIGGER dbo.trg_StockItems_Update
ON dbo.StockItems
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.StockItems_AuditLog (StockID, ActionType, StockNumber, Description, Quantity, Status, ChangedByUserID)
    SELECT StockID, 'U', StockNumber, Description, Quantity, Status, NULL
    FROM inserted;
END
GO

IF OBJECT_ID('dbo.trg_StockItems_Delete', 'TR') IS NOT NULL DROP TRIGGER dbo.trg_StockItems_Delete;
GO
CREATE TRIGGER dbo.trg_StockItems_Delete
ON dbo.StockItems
AFTER DELETE
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.StockItems_AuditLog (StockID, ActionType, StockNumber, Description, Quantity, Status, ChangedByUserID)
    SELECT StockID, 'D', StockNumber, Description, Quantity, Status, NULL
    FROM deleted;
END
GO

-- ============================================================
-- STOCK TRANSACTIONS TRIGGER (Insert only - history is append-only)
-- ============================================================
IF OBJECT_ID('dbo.trg_StockTransactions_Insert', 'TR') IS NOT NULL DROP TRIGGER dbo.trg_StockTransactions_Insert;
GO
CREATE TRIGGER dbo.trg_StockTransactions_Insert
ON dbo.StockTransactions
AFTER INSERT
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.StockTransactions_AuditLog (TransactionID, ActionType, StockID, TransactionType, QuantityChange, ChangedByUserID)
    SELECT TransactionID, 'C', StockID, TransactionType, QuantityChange, PerformedByUserID
    FROM inserted;
END
GO
