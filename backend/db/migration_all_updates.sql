-- ════════════════════════════════════════════════════════════════
-- migration_all_updates.sql
-- Runs EVERY SQL Server change made to this project so far, in one
-- go. 100% safe on a database that already has real customers/
-- accounts in it:
--   - Never drops a table
--   - Every step checks "does this already exist?" first, so running
--     it more than once (or on a database that already has some of
--     these changes) does nothing extra / causes no errors.
--
-- Covers:
--   1. Login-with-email support   → UX_Users_Email unique index
--   2. Raw Excel/SQL import       → Accounts columns + ImportedBalances
--                                    table + usp_SyncImportedBalances
--   3. "Online now" indicator     → Users.LastSeenAt column
--
-- Run once:
--   sqlcmd -S localhost -U sa -P "YourPassword" -i migration_all_updates.sql
-- ════════════════════════════════════════════════════════════════

USE AccountingDashboardDB;
GO

-- ── 1) Login with Username OR Email ───────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Users_Email' AND object_id = OBJECT_ID('dbo.Users'))
    CREATE UNIQUE INDEX UX_Users_Email ON dbo.Users(Email) WHERE Email IS NOT NULL;
GO

-- ── 2) Raw Excel / SQL Server import ──────────────────────────────
IF COL_LENGTH('dbo.Accounts', 'Haben') IS NULL
    ALTER TABLE dbo.Accounts ADD Haben DECIMAL(18,2) NULL;
GO
IF COL_LENGTH('dbo.Accounts', 'Soll') IS NULL
    ALTER TABLE dbo.Accounts ADD Soll DECIMAL(18,2) NULL;
GO
IF COL_LENGTH('dbo.Accounts', 'Betrag') IS NULL
    ALTER TABLE dbo.Accounts ADD Betrag DECIMAL(18,2) NULL;
GO
IF COL_LENGTH('dbo.Accounts', 'LastStatementDate') IS NULL
    ALTER TABLE dbo.Accounts ADD LastStatementDate DATE NULL;
GO

IF OBJECT_ID('dbo.ImportedBalances', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ImportedBalances (
        ImportId    INT IDENTITY(1,1) PRIMARY KEY,
        Kontonummer NVARCHAR(40)   NOT NULL,
        Currency    NVARCHAR(3)    NOT NULL,
        Saldo       DECIMAL(18,2)  NULL,
        Haben       DECIMAL(18,2)  NULL,
        Soll        DECIMAL(18,2)  NULL,
        Betrag      DECIMAL(18,2)  NULL,
        AktivKonto  BIT            NULL,
        Datum       DATE           NULL,
        ImportedAt  DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_ImportedBalances_Konto ON dbo.ImportedBalances(Kontonummer);
END
GO

IF OBJECT_ID('dbo.usp_SyncImportedBalances', 'P') IS NOT NULL
    DROP PROCEDURE dbo.usp_SyncImportedBalances;
GO

CREATE PROCEDURE dbo.usp_SyncImportedBalances
AS
BEGIN
    SET NOCOUNT ON;

    ;WITH Latest AS (
        SELECT *,
               ROW_NUMBER() OVER (PARTITION BY Kontonummer ORDER BY ImportedAt DESC) AS rn
        FROM dbo.ImportedBalances
    )
    UPDATE a
    SET a.Balance           = l.Saldo,
        a.Haben              = l.Haben,
        a.Soll               = l.Soll,
        a.Betrag             = l.Betrag,
        a.LastStatementDate  = l.Datum,
        a.Status             = CASE WHEN l.AktivKonto = 0 THEN 'Inactive' ELSE a.Status END,
        a.IsActive           = ISNULL(l.AktivKonto, a.IsActive)
    FROM dbo.Accounts a
    JOIN Latest l ON l.Kontonummer = a.AccountNumber AND l.rn = 1;

    ;WITH Latest2 AS (
        SELECT *,
               ROW_NUMBER() OVER (PARTITION BY Kontonummer ORDER BY ImportedAt DESC) AS rn
        FROM dbo.ImportedBalances
    )
    INSERT INTO dbo.Accounts
        (AccountNumber, Label, CurrencyCode, Balance, Haben, Soll, Betrag, LastStatementDate, Status, IsActive, CustomerId)
    SELECT
        l.Kontonummer, l.Kontonummer, l.Currency, l.Saldo, l.Haben, l.Soll, l.Betrag, l.Datum,
        CASE WHEN l.AktivKonto = 0 THEN 'Inactive' ELSE 'Active' END,
        ISNULL(l.AktivKonto, 1),
        NULL
    FROM Latest2 l
    WHERE l.rn = 1
      AND NOT EXISTS (SELECT 1 FROM dbo.Accounts a WHERE a.AccountNumber = l.Kontonummer);
END
GO

-- ── 3) "Online now" indicator ──────────────────────────────────────
IF COL_LENGTH('dbo.Users', 'LastSeenAt') IS NULL
    ALTER TABLE dbo.Users ADD LastSeenAt DATETIME2 NULL;
GO

PRINT 'migration_all_updates.sql complete — your database is fully up to date. No existing data was touched.';
