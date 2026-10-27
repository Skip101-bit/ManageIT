/* ================================================================
   MANAGEIT - 01 CREATE DATABASE
   ================================================================ */

IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'ManageIT')
BEGIN
    CREATE DATABASE ManageIT;
END
GO

USE ManageIT;
GO
