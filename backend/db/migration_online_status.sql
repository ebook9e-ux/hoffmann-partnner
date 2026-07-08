-- ════════════════════════════════════════════════════════════════
-- migration_online_status.sql
-- Adds the "who's online now" feature to an EXISTING database.
-- Only adds a column — never drops/touches existing data.
--
-- Run once:
--   sqlcmd -S localhost -U sa -P "YourPassword" -i migration_online_status.sql
-- ════════════════════════════════════════════════════════════════

USE AccountingDashboardDB;
GO

IF COL_LENGTH('dbo.Users', 'LastSeenAt') IS NULL
    ALTER TABLE dbo.Users ADD LastSeenAt DATETIME2 NULL;
GO

PRINT 'Migration complete: LastSeenAt column ready for the online indicator.';
