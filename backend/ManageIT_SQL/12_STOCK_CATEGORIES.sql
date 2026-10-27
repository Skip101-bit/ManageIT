/* ================================================================
   MANAGEIT - 12 STOCK CATEGORY UPDATE
   Production · Service · Legacy Inventory
   Run on database ManageIT after prior scripts
   ================================================================ */

USE ManageIT;
GO

UPDATE dbo.StockItems SET StockType = 'Production' WHERE StockType IN ('General', 'General Stock', 'Job', 'Job-Specific Stock');
UPDATE dbo.StockItems SET StockType = 'Service'    WHERE StockType IN ('Service', 'Service Stock');
UPDATE dbo.StockItems SET StockType = 'Legacy Inventory' WHERE StockType IN ('Dismissed', 'Legacy Inventory', 'Legacy');
GO

IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE parent_object_id = OBJECT_ID('dbo.StockItems') AND COL_NAME(parent_object_id, parent_column_id) = 'StockType')
BEGIN
    DECLARE @df NVARCHAR(200);
    SELECT @df = name FROM sys.default_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.StockItems') AND COL_NAME(parent_object_id, parent_column_id) = 'StockType';
    EXEC('ALTER TABLE dbo.StockItems DROP CONSTRAINT ' + @df);
END
GO

ALTER TABLE dbo.StockItems ADD CONSTRAINT DF_StockItems_StockType DEFAULT 'Production' FOR StockType;
GO
