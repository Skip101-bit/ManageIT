/* ================================================================
   ManageIT — LMS access flag on Users
   Run against an existing database to add CanAccessLms and
   refresh user stored procedures so admin can grant LMS login.
   ================================================================ */

IF COL_LENGTH('dbo.Users', 'CanAccessLms') IS NULL
BEGIN
    ALTER TABLE dbo.Users ADD CanAccessLms BIT NOT NULL
        CONSTRAINT DF_Users_CanAccessLms DEFAULT (0);
    PRINT 'Added dbo.Users.CanAccessLms';
END
ELSE
    PRINT 'dbo.Users.CanAccessLms already exists';
GO

-- Admins can use LMS by default (optional bootstrap)
UPDATE dbo.Users SET CanAccessLms = 1 WHERE Role IN ('Admin', 'admin') AND CanAccessLms = 0;
GO

IF OBJECT_ID('dbo.usp_User_GetBySALNumber', 'P') IS NOT NULL
    DROP PROCEDURE dbo.usp_User_GetBySALNumber;
GO
CREATE PROCEDURE dbo.usp_User_GetBySALNumber
    @SALNumber VARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT UserID, SALNumber, FullName, Email, PasswordHash, Role, DepartmentID, Status,
           LastLogin, CreatedDate, ModifiedDate, CanAccessLms
    FROM dbo.Users
    WHERE SALNumber = @SALNumber;
END
GO

IF OBJECT_ID('dbo.usp_User_GetById', 'P') IS NOT NULL
    DROP PROCEDURE dbo.usp_User_GetById;
GO
CREATE PROCEDURE dbo.usp_User_GetById
    @UserID INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT UserID, SALNumber, FullName, Email, Role, DepartmentID, Status,
           LastLogin, CreatedDate, ModifiedDate, CanAccessLms
    FROM dbo.Users
    WHERE UserID = @UserID;
END
GO

IF OBJECT_ID('dbo.usp_User_GetAll', 'P') IS NOT NULL
    DROP PROCEDURE dbo.usp_User_GetAll;
GO
CREATE PROCEDURE dbo.usp_User_GetAll
AS
BEGIN
    SET NOCOUNT ON;
    SELECT UserID, SALNumber, FullName, Email, Role, DepartmentID, Status,
           LastLogin, CreatedDate, ModifiedDate, CanAccessLms
    FROM dbo.Users
    ORDER BY UserID;
END
GO

IF OBJECT_ID('dbo.usp_User_Create', 'P') IS NOT NULL
    DROP PROCEDURE dbo.usp_User_Create;
GO
CREATE PROCEDURE dbo.usp_User_Create
    @SALNumber     VARCHAR(20),
    @FullName      VARCHAR(100),
    @PasswordHash  VARCHAR(255),
    @Role          VARCHAR(20),
    @Status        CHAR(1),
    @CanAccessLms  BIT = 0
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.Users (SALNumber, FullName, Email, PasswordHash, Role, DepartmentID, Status, CanAccessLms)
    VALUES (@SALNumber, @FullName, NULL, @PasswordHash, @Role, NULL, @Status, @CanAccessLms);

    SELECT UserID, SALNumber, FullName, Email, Role, DepartmentID, Status,
           LastLogin, CreatedDate, ModifiedDate, CanAccessLms
    FROM dbo.Users
    WHERE UserID = SCOPE_IDENTITY();
END
GO

IF OBJECT_ID('dbo.usp_User_Update', 'P') IS NOT NULL
    DROP PROCEDURE dbo.usp_User_Update;
GO
CREATE PROCEDURE dbo.usp_User_Update
    @UserID          INT,
    @SALNumber       VARCHAR(20),
    @FullName        VARCHAR(100),
    @PasswordHash    VARCHAR(255) = NULL,
    @UpdatePassword  BIT = 0,
    @Role            VARCHAR(20),
    @Status          CHAR(1),
    @CanAccessLms    BIT = 0
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE dbo.Users
    SET SALNumber    = @SALNumber,
        FullName     = @FullName,
        Role         = @Role,
        Status       = @Status,
        CanAccessLms = @CanAccessLms,
        PasswordHash = CASE WHEN @UpdatePassword = 1 THEN @PasswordHash ELSE PasswordHash END,
        ModifiedDate = GETDATE()
    WHERE UserID = @UserID;

    SELECT UserID, SALNumber, FullName, Email, Role, DepartmentID, Status,
           LastLogin, CreatedDate, ModifiedDate, CanAccessLms
    FROM dbo.Users
    WHERE UserID = @UserID;
END
GO

IF OBJECT_ID('dbo.usp_User_CanAccessLms', 'P') IS NOT NULL
    DROP PROCEDURE dbo.usp_User_CanAccessLms;
GO
CREATE PROCEDURE dbo.usp_User_CanAccessLms
    @SALNumber VARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT CAST(CASE
        WHEN EXISTS (
            SELECT 1 FROM dbo.Users
            WHERE SALNumber = @SALNumber
              AND Status = 'A'
              AND CanAccessLms = 1
        ) THEN 1 ELSE 0 END AS BIT) AS CanAccessLms;
END
GO

PRINT 'LMS access scripts applied.';
GO
