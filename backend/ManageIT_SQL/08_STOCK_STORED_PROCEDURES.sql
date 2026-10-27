/* ================================================================
   MANAGEIT - 08 STOCK STORED PROCEDURES
   Individual stock item CRUD (online save on button click)
   Naming: dbo.usp_Stock_<Action>
   Run after 07_CREATE_STORED_PROCEDURES.sql on existing databases.
   ================================================================ */

USE ManageIT;
GO

-- ============================================================
-- usp_Stock_GetById
-- Single stock item with job and location details
-- ============================================================
IF OBJECT_ID('dbo.usp_Stock_GetById', 'P') IS NOT NULL
    DROP PROCEDURE dbo.usp_Stock_GetById;
GO
CREATE PROCEDURE dbo.usp_Stock_GetById
    @StockID INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        s.StockID,
        s.StockNumber,
        s.PartNumber,
        s.SerialNumber,
        s.Description,
        s.Quantity,
        s.PONumber,
        s.StockType,
        s.LocationID,
        s.TrayBin,
        s.JobID,
        s.Status,
        s.CreatedDate,
        s.ModifiedDate,
        j.JobNumber,
        j.Category AS JobCategory,
        l.LocationName
    FROM dbo.StockItems s
    LEFT JOIN dbo.Jobs j ON s.JobID = j.JobID
    LEFT JOIN dbo.StorageLocations l ON s.LocationID = l.LocationID
    WHERE s.StockID = @StockID;
END
GO

-- ============================================================
-- usp_Stock_Create
-- Insert one stock item; returns the new row
-- ============================================================
IF OBJECT_ID('dbo.usp_Stock_Create', 'P') IS NOT NULL
    DROP PROCEDURE dbo.usp_Stock_Create;
GO
CREATE PROCEDURE dbo.usp_Stock_Create
    @StockNumber     VARCHAR(30),
    @PartNumber      VARCHAR(50)     = NULL,
    @SerialNumber    VARCHAR(50)     = NULL,
    @Description     VARCHAR(255)    = NULL,
    @Quantity        INT,
    @PONumber        VARCHAR(50)     = NULL,
    @StockType       VARCHAR(20),
    @LocationID      INT             = NULL,
    @TrayBin         VARCHAR(50)     = NULL,
    @JobID           INT             = NULL,
    @Status          VARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO dbo.StockItems
        (StockNumber, PartNumber, SerialNumber, Description, Quantity, PONumber,
         StockType, LocationID, TrayBin, JobID, Status)
    VALUES
        (@StockNumber, @PartNumber, @SerialNumber, @Description, @Quantity, @PONumber,
         @StockType, @LocationID, @TrayBin, @JobID, @Status);

    DECLARE @NewStockID INT = SCOPE_IDENTITY();

    EXEC dbo.usp_Stock_GetById @StockID = @NewStockID;
END
GO

-- ============================================================
-- usp_Stock_Update
-- Update one stock item; returns the updated row
-- ============================================================
IF OBJECT_ID('dbo.usp_Stock_Update', 'P') IS NOT NULL
    DROP PROCEDURE dbo.usp_Stock_Update;
GO
CREATE PROCEDURE dbo.usp_Stock_Update
    @StockID         INT,
    @StockNumber     VARCHAR(30),
    @PartNumber      VARCHAR(50)     = NULL,
    @SerialNumber    VARCHAR(50)     = NULL,
    @Description     VARCHAR(255)    = NULL,
    @Quantity        INT,
    @PONumber        VARCHAR(50)     = NULL,
    @StockType       VARCHAR(20),
    @LocationID      INT             = NULL,
    @TrayBin         VARCHAR(50)     = NULL,
    @JobID           INT             = NULL,
    @Status          VARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE dbo.StockItems
    SET StockNumber   = @StockNumber,
        PartNumber    = @PartNumber,
        SerialNumber  = @SerialNumber,
        Description   = @Description,
        Quantity      = @Quantity,
        PONumber      = @PONumber,
        StockType     = @StockType,
        LocationID    = @LocationID,
        TrayBin       = @TrayBin,
        JobID         = @JobID,
        Status        = @Status,
        ModifiedDate  = GETDATE()
    WHERE StockID = @StockID;

    IF @@ROWCOUNT = 0
        RETURN;

    EXEC dbo.usp_Stock_GetById @StockID = @StockID;
END
GO

-- ============================================================
-- usp_Stock_Delete
-- Delete one stock item by primary key
-- ============================================================
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

PRINT 'Stock stored procedures created.';
GO
