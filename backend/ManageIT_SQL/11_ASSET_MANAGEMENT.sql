/* ================================================================
   MANAGEIT - 11 ASSET MANAGEMENT
   Fixed assets register, maintenance & compliance tracking
   ================================================================ */

USE ManageIT;
GO

IF OBJECT_ID(N'dbo.Assets', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Assets (
        AssetID                 INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        AssetNumber             VARCHAR(30)     NOT NULL,
        AssetName               VARCHAR(255)    NOT NULL,
        Description             VARCHAR(500)    NULL,
        Category                VARCHAR(50)     NULL,
        SubCategory             VARCHAR(50)     NULL,
        Manufacturer            VARCHAR(100)    NULL,
        Model                   VARCHAR(100)    NULL,
        SerialNumber            VARCHAR(80)     NULL,
        AssetTag                VARCHAR(50)     NULL,
        Status                  VARCHAR(20)     NOT NULL CONSTRAINT DF_Assets_Status DEFAULT ('Active'),
        Condition               VARCHAR(20)     NULL,
        LocationID              INT             NULL,
        JobID                   INT             NULL,
        AssignedUserID          INT             NULL,
        Department              VARCHAR(100)    NULL,
        PurchaseDate            DATE            NULL,
        PurchaseCost            DECIMAL(18,2)   NULL,
        CurrentValue            DECIMAL(18,2)   NULL,
        WarrantyExpiry          DATE            NULL,
        InsuranceExpiry         DATE            NULL,
        LastInspectionDate      DATE            NULL,
        NextInspectionDue       DATE            NULL,
        MaintenanceIntervalDays INT             NULL,
        DepreciationYears       INT             NULL,
        Notes                   VARCHAR(1000)   NULL,
        CreatedDate             DATETIME        NOT NULL CONSTRAINT DF_Assets_Created DEFAULT (GETDATE()),
        ModifiedDate            DATETIME        NULL,
        CONSTRAINT UQ_Assets_AssetNumber        UNIQUE (AssetNumber),
        CONSTRAINT FK_Assets_Location           FOREIGN KEY (LocationID) REFERENCES dbo.StorageLocations(LocationID),
        CONSTRAINT FK_Assets_Job                FOREIGN KEY (JobID) REFERENCES dbo.Jobs(JobID),
        CONSTRAINT FK_Assets_User               FOREIGN KEY (AssignedUserID) REFERENCES dbo.Users(UserID)
    );
    CREATE INDEX IX_Assets_Status           ON dbo.Assets(Status);
    CREATE INDEX IX_Assets_Category         ON dbo.Assets(Category);
    CREATE INDEX IX_Assets_NextInspection   ON dbo.Assets(NextInspectionDue);
    PRINT 'Created dbo.Assets';
END
GO

IF OBJECT_ID(N'dbo.AssetMaintenance', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AssetMaintenance (
        MaintenanceID     INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        AssetID           INT             NOT NULL,
        MaintenanceType   VARCHAR(30)     NOT NULL,
        Status            VARCHAR(20)     NOT NULL CONSTRAINT DF_AssetMaint_Status DEFAULT ('Scheduled'),
        ScheduledDate     DATE            NULL,
        CompletedDate     DATE            NULL,
        PerformedBy       VARCHAR(100)    NULL,
        Vendor            VARCHAR(100)    NULL,
        Cost              DECIMAL(18,2)   NULL,
        Description       VARCHAR(500)    NULL,
        PartsUsed         VARCHAR(500)    NULL,
        NextDueDate       DATE            NULL,
        Notes             VARCHAR(1000)   NULL,
        CreatedDate       DATETIME        NOT NULL CONSTRAINT DF_AssetMaint_Created DEFAULT (GETDATE()),
        ModifiedDate      DATETIME        NULL,
        CONSTRAINT FK_AssetMaint_Asset FOREIGN KEY (AssetID) REFERENCES dbo.Assets(AssetID) ON DELETE CASCADE
    );
    CREATE INDEX IX_AssetMaint_Asset ON dbo.AssetMaintenance(AssetID);
    CREATE INDEX IX_AssetMaint_NextDue ON dbo.AssetMaintenance(NextDueDate);
    PRINT 'Created dbo.AssetMaintenance';
END
GO

PRINT 'Asset management schema ready.';
GO
