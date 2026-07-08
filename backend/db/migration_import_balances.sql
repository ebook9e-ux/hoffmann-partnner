-- ════════════════════════════════════════════════════════════════
-- migration_import_balances.sql
-- Adds the raw Excel/SQL-Server import feature to an EXISTING
-- database that you've already been using (has real customers/
-- accounts in it already).
--
-- Unlike schema.sql, this script does NOT drop any table — it only
-- adds new columns/objects. Safe to run on your current database.
--
-- Run once:
--   sqlcmd -S localhost -U sa -P "YourPassword" -i migration_import_balances.sql
-- (or via the docker exec / sqlcmd -C form shown in the README)
-- ════════════════════════════════════════════════════════════════

USE AccountingDashboardDB;
GO

-- ── New columns on dbo.Accounts ───────────────────────────────────
-- Raw values from the Excel/SQL Server import — copied over as-is by
-- usp_SyncImportedBalances below, with NO recalculation. Score/Status
-- stay driven by the existing Transactions-based scoring engine;
-- these four columns are just a pass-through display of whatever the
-- last import said.
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

-- ── dbo.ImportedBalances (landing table for the 3 Excel sheets) ──
IF OBJECT_ID('dbo.ImportedBalances', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ImportedBalances (
        ImportId    INT IDENTITY(1,1) PRIMARY KEY,
        Kontonummer NVARCHAR(40)   NOT NULL,   -- kontonumber
        Currency    NVARCHAR(3)    NOT NULL,   -- 'EUR' | 'USD' | 'CHF'
        Saldo       DECIMAL(18,2)  NULL,       -- saldo
        Haben       DECIMAL(18,2)  NULL,       -- haben
        Soll        DECIMAL(18,2)  NULL,       -- soll
        Betrag      DECIMAL(18,2)  NULL,       -- betragen
        AktivKonto  BIT            NULL,       -- active kont
        Datum       DATE           NULL,       -- datum
        ImportedAt  DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_ImportedBalances_Konto ON dbo.ImportedBalances(Kontonummer);
END
GO

-- ── usp_SyncImportedBalances ──────────────────────────────────────
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
        l.Kontonummer,
        l.Kontonummer,
        l.Currency,
        l.Saldo,
        l.Haben,
        l.Soll,
        l.Betrag,
        l.Datum,
        CASE WHEN l.AktivKonto = 0 THEN 'Inactive' ELSE 'Active' END,
        ISNULL(l.AktivKonto, 1),
        NULL
    FROM Latest2 l
    WHERE l.rn = 1
      AND NOT EXISTS (SELECT 1 FROM dbo.Accounts a WHERE a.AccountNumber = l.Kontonummer);
END
GO

PRINT 'Migration complete: ImportedBalances table + usp_SyncImportedBalances ready. Your existing customers/accounts were not touched.';
