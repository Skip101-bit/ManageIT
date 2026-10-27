/* ================================================================
   MANAGEIT - 16 BOM, PASTEL ALIGNMENT, JOB CARD CHECKS
   Run after 11_ASSET_MANAGEMENT.sql on database ManageIT.
   The API also creates this table on startup when it can.
   ================================================================ */

USE ManageIT;
GO

IF OBJECT_ID('dbo.EngineeringDocs', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.EngineeringDocs (
        DocKey      VARCHAR(40)   NOT NULL PRIMARY KEY,
        PayloadJson NVARCHAR(MAX) NOT NULL,
        UpdatedAt   DATETIME      NOT NULL DEFAULT GETDATE()
    );
END
GO

PRINT 'Engineering documents table ready.';
GO
