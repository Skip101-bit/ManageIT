/* ================================================================
   MANAGEIT - 00 MASTER DEPLOYMENT SCRIPT
   ================================================================
   IMPORTANT: This script uses SQLCMD mode to chain the other
   scripts together. In SSMS, enable SQLCMD mode first:
       Query menu -> SQLCMD Mode
   Then run this script from the SAME FOLDER as the other .sql files.

   If you don't want to use SQLCMD mode, simply open and run each
   file individually in this order instead:
     2. 02_CREATE_TABLES.sql
     3. 03_CREATE_AUDIT_TABLES.sql
     4. 04_CREATE_TRIGGERS.sql
     5. 06_EXTRA_TABLES.sql
     6. 07_CREATE_STORED_PROCEDURES.sql
     7. 08_STOCK_STORED_PROCEDURES.sql
     8. 05_SEED_DATA.sql   (optional)
     9. 09_RBAC_PERMISSIONS.sql (optional — RBAC tables)
   ================================================================ */

:r .\01_CREATE_DATABASE.sql
:r .\02_CREATE_TABLES.sql
:r .\03_CREATE_AUDIT_TABLES.sql
:r .\04_CREATE_TRIGGERS.sql
:r .\06_EXTRA_TABLES.sql
:r .\07_CREATE_STORED_PROCEDURES.sql
:r .\08_STOCK_STORED_PROCEDURES.sql
:r .\09_RBAC_PERMISSIONS.sql
:r .\10_INVENTORY_PORTAL.sql
:r .\11_ASSET_MANAGEMENT.sql
:r .\16_ENGINEERING.sql
:r .\17_LMS_ACCESS.sql
:r .\05_SEED_DATA.sql

PRINT 'ManageIT database deployment complete.';
GO
