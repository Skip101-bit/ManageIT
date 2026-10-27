/* ================================================================
   MANAGEIT - 07 CREATE STORED PROCEDURES
   User operations (login / profile lookup)
   Naming: dbo.usp_<Entity>_<Action>
   ================================================================ */

USE ManageIT;
GO

-- ============================================================
-- usp_User_GetBySALNumber
-- Lookup user by employee SAL login (includes PasswordHash for auth)
-- ============================================================
IF OBJECT_ID('dbo.usp_User_GetBySALNumber', 'P') IS NOT NULL
    DROP PROCEDURE dbo.usp_User_GetBySALNumber;
GO
CREATE PROCEDURE dbo.usp_User_GetBySALNumber
    @SALNumber VARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        UserID,
        SALNumber,
        FullName,
        Email,
        PasswordHash,
        Role,
        DepartmentID,
        Status,
        LastLogin,
        CreatedDate,
        ModifiedDate,
        CanAccessLms
    FROM dbo.Users
    WHERE SALNumber = @SALNumber;
END
GO

-- ============================================================
-- usp_User_GetById
-- Profile lookup by primary key (no password hash)
-- ============================================================
IF OBJECT_ID('dbo.usp_User_GetById', 'P') IS NOT NULL
    DROP PROCEDURE dbo.usp_User_GetById;
GO
CREATE PROCEDURE dbo.usp_User_GetById
    @UserID INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        UserID,
        SALNumber,
        FullName,
        Email,
        Role,
        DepartmentID,
        Status,
        LastLogin,
        CreatedDate,
        ModifiedDate,
        CanAccessLms
    FROM dbo.Users
    WHERE UserID = @UserID;
END
GO

-- ============================================================
-- usp_User_UpdateLastLogin
-- Record successful login timestamp
-- ============================================================
IF OBJECT_ID('dbo.usp_User_UpdateLastLogin', 'P') IS NOT NULL
    DROP PROCEDURE dbo.usp_User_UpdateLastLogin;
GO
CREATE PROCEDURE dbo.usp_User_UpdateLastLogin
    @UserID INT
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE dbo.Users
    SET LastLogin   = GETDATE(),
        ModifiedDate = GETDATE()
    WHERE UserID = @UserID;
END
GO

PRINT 'User stored procedures created.';
GO
