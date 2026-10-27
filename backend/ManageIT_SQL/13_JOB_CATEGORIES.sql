/* ================================================================
   MANAGEIT - 13 JOB CATEGORY UPDATE
   Production · Service · Legacy Inventory
   Run on database ManageIT
   ================================================================ */

USE ManageIT;
GO

UPDATE dbo.Jobs SET Category = 'Service' WHERE Category LIKE '%Service%';
UPDATE dbo.Jobs SET Category = 'Legacy Inventory' WHERE Category LIKE '%Legacy%' OR Category LIKE '%Dismissed%';
UPDATE dbo.Jobs SET Category = 'Production'
WHERE Category NOT IN ('Production', 'Service', 'Legacy Inventory');
GO
