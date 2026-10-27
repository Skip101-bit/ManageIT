/* ================================================================
   MANAGEIT - 14 INVENTORY CATEGORY LABELS
   Production Inventory · Service Inventory · Legacy Inventory
   Run on database ManageIT
   ================================================================ */

USE ManageIT;
GO

IF COL_LENGTH('dbo.StockItems', 'StockType') IS NOT NULL
BEGIN
    ALTER TABLE dbo.StockItems ALTER COLUMN StockType VARCHAR(30) NOT NULL;
END
GO

UPDATE dbo.StockItems SET StockType = 'Production Inventory' WHERE StockType IN ('Production', 'General', 'General Stock', 'Job', 'Job-Specific Stock');
UPDATE dbo.StockItems SET StockType = 'Service Inventory'    WHERE StockType IN ('Service', 'Service Stock');
UPDATE dbo.StockItems SET StockType = 'Legacy Inventory'     WHERE StockType IN ('Dismissed', 'Legacy', 'Legacy Inventory');
GO

UPDATE dbo.Jobs SET Category = 'Production Inventory' WHERE Category IN ('Production', 'General', 'General Stock', 'Job', 'Job-Specific Stock')
  OR (Category NOT IN ('Production Inventory', 'Service Inventory', 'Legacy Inventory') AND Category NOT LIKE '%Service%');
UPDATE dbo.Jobs SET Category = 'Service Inventory' WHERE Category IN ('Service', 'Service Stock') OR Category LIKE '%Service%';
UPDATE dbo.Jobs SET Category = 'Legacy Inventory' WHERE Category IN ('Dismissed', 'Legacy') OR Category LIKE '%Legacy%';
GO

IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE parent_object_id = OBJECT_ID('dbo.StockItems') AND COL_NAME(parent_object_id, parent_column_id) = 'StockType')
BEGIN
    DECLARE @df NVARCHAR(200);
    SELECT @df = name FROM sys.default_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.StockItems') AND COL_NAME(parent_object_id, parent_column_id) = 'StockType';
    EXEC('ALTER TABLE dbo.StockItems DROP CONSTRAINT ' + @df);
END
GO

ALTER TABLE dbo.StockItems ADD CONSTRAINT DF_StockItems_StockType DEFAULT 'Production Inventory' FOR StockType;
GO
