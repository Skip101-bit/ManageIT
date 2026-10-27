-- Fix stock delete: remove transactions before stock item (FK_StockTransactions_Stock)
USE ManageIT;
GO

IF OBJECT_ID('dbo.usp_Stock_Delete', 'P') IS NOT NULL
    DROP PROCEDURE dbo.usp_Stock_Delete;
GO
CREATE PROCEDURE dbo.usp_Stock_Delete
    @StockID INT
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM dbo.StockTransactions WHERE StockID = @StockID;
    DELETE FROM dbo.StockItems WHERE StockID = @StockID;

    SELECT @@ROWCOUNT AS RowsAffected;
END
GO

PRINT 'usp_Stock_Delete updated — transactions deleted before stock item.';
GO
