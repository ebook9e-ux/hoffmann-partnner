-- ════════════════════════════════════════════════════════════════
-- Stored procedures: scoring engine, alert generation, snapshots
-- Run after schema.sql:
--   sqlcmd -S localhost -U sa -P "..." -i procedures.sql
-- ════════════════════════════════════════════════════════════════

USE AccountingDashboardDB;
GO

-- ────────────────────────────────────────────────────────────────
-- usp_RecalculateAccountScore
-- Scoring rule (0-15), evaluated from the account's current month:
--   Start at 15.
--   -5  if Loss > Profit this month
--   -5  if ExtraCost > ExpenseLimit this month
--   -5  if account has had zero transactions in the last 60 days
--   Floor at 0. Maps to Status: 15=Active, 10-14=Medium, 0-9=Inactive
-- Run this after any transaction write, or on a schedule.
-- ────────────────────────────────────────────────────────────────
IF OBJECT_ID('dbo.usp_RecalculateAccountScore', 'P') IS NOT NULL
    DROP PROCEDURE dbo.usp_RecalculateAccountScore;
GO

CREATE PROCEDURE dbo.usp_RecalculateAccountScore
    @AccountId INT = NULL  -- NULL = recalculate all accounts
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @MonthStart DATE = DATEFROMPARTS(YEAR(SYSUTCDATETIME()), MONTH(SYSUTCDATETIME()), 1);

    ;WITH MonthFigures AS (
        SELECT
            a.AccountId,
            a.ExpenseLimit,
            ISNULL(SUM(CASE WHEN t.TxType = 'Profit' THEN t.Amount ELSE 0 END), 0) AS MonthProfit,
            ISNULL(SUM(CASE WHEN t.TxType = 'Loss' THEN t.Amount ELSE 0 END), 0) AS MonthLoss,
            ISNULL(SUM(CASE WHEN t.Category = 'ExtraCost' THEN t.Amount ELSE 0 END), 0) AS MonthExtraCost,
            MAX(t.TransactionDate) AS LastTxDate
        FROM dbo.Accounts a
        LEFT JOIN dbo.Transactions t
               ON t.AccountId = a.AccountId AND t.TransactionDate >= @MonthStart
        WHERE (@AccountId IS NULL OR a.AccountId = @AccountId)
        GROUP BY a.AccountId, a.ExpenseLimit
    ),
    Scored AS (
        SELECT
            AccountId,
            15
              - CASE WHEN MonthLoss > MonthProfit THEN 5 ELSE 0 END
              - CASE WHEN MonthExtraCost > ExpenseLimit THEN 5 ELSE 0 END
              - CASE WHEN LastTxDate IS NULL OR LastTxDate < DATEADD(DAY, -60, SYSUTCDATETIME()) THEN 5 ELSE 0 END
              AS RawScore
        FROM MonthFigures
    )
    UPDATE a
    SET a.Score = CASE WHEN s.RawScore < 0 THEN 0 ELSE s.RawScore END,
        a.Status = CASE
                       WHEN (CASE WHEN s.RawScore < 0 THEN 0 ELSE s.RawScore END) >= 15 THEN 'Active'
                       WHEN (CASE WHEN s.RawScore < 0 THEN 0 ELSE s.RawScore END) >= 10 THEN 'Medium'
                       ELSE 'Inactive'
                   END
    FROM dbo.Accounts a
    JOIN Scored s ON s.AccountId = a.AccountId;
END
GO

-- ────────────────────────────────────────────────────────────────
-- usp_RefreshAlerts
-- Clears unresolved auto-generated alerts and re-derives them from
-- current account/transaction state. Call after recalculating scores.
-- ────────────────────────────────────────────────────────────────
IF OBJECT_ID('dbo.usp_RefreshAlerts', 'P') IS NOT NULL
    DROP PROCEDURE dbo.usp_RefreshAlerts;
GO

CREATE PROCEDURE dbo.usp_RefreshAlerts
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM dbo.Alerts WHERE IsResolved = 0;

    DECLARE @MonthStart DATE = DATEFROMPARTS(YEAR(SYSUTCDATETIME()), MONTH(SYSUTCDATETIME()), 1);

    ;WITH MonthFigures AS (
        SELECT
            a.AccountId, a.AccountNumber, a.Score, a.ExpenseLimit,
            ISNULL(SUM(CASE WHEN t.TxType = 'Profit' THEN t.Amount ELSE 0 END), 0) AS MonthProfit,
            ISNULL(SUM(CASE WHEN t.TxType = 'Loss' THEN t.Amount ELSE 0 END), 0) AS MonthLoss,
            ISNULL(SUM(CASE WHEN t.Category = 'ExtraCost' THEN t.Amount ELSE 0 END), 0) AS MonthExtraCost
        FROM dbo.Accounts a
        LEFT JOIN dbo.Transactions t
               ON t.AccountId = a.AccountId AND t.TransactionDate >= @MonthStart
        GROUP BY a.AccountId, a.AccountNumber, a.Score, a.ExpenseLimit
    )

    -- Rule 1: account score is zero -> inactive
    INSERT INTO dbo.Alerts (AccountId, Severity, MessageKey, MessageText)
    SELECT AccountId, 'critical', 'ACCOUNT_INACTIVE',
           N'Account ' + AccountNumber + N' is inactive.'
    FROM MonthFigures WHERE Score = 0;

    -- Rule 2: extra cost exceeded the account's configured limit
    INSERT INTO dbo.Alerts (AccountId, Severity, MessageKey, MessageText)
    SELECT AccountId, 'warning', 'EXCESSIVE_EXPENSE',
           N'Account ' + AccountNumber + N' has excessive expenses.'
    FROM MonthFigures WHERE MonthExtraCost > ExpenseLimit;

    -- Rule 3: loss exceeds profit this month
    INSERT INTO dbo.Alerts (AccountId, Severity, MessageKey, MessageText)
    SELECT AccountId, 'critical', 'LOSS_EXCEEDS_PROFIT',
           N'Account ' + AccountNumber + N': loss exceeded profit.'
    FROM MonthFigures WHERE MonthLoss > MonthProfit AND MonthLoss > 0;

    -- Rule 4: net result for the month is negative
    INSERT INTO dbo.Alerts (AccountId, Severity, MessageKey, MessageText)
    SELECT AccountId, 'warning', 'NEGATIVE_PROFIT',
           N'Account ' + AccountNumber + N' has negative profit this month.'
    FROM MonthFigures WHERE (MonthProfit - MonthLoss) < 0;
END
GO

-- ────────────────────────────────────────────────────────────────
-- usp_RebuildMonthlySnapshot
-- Recomputes dbo.MonthlySnapshots from raw transactions for a given
-- account (or all accounts). Run after bulk-importing historical data.
-- ────────────────────────────────────────────────────────────────
IF OBJECT_ID('dbo.usp_RebuildMonthlySnapshot', 'P') IS NOT NULL
    DROP PROCEDURE dbo.usp_RebuildMonthlySnapshot;
GO

CREATE PROCEDURE dbo.usp_RebuildMonthlySnapshot
    @AccountId INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF @AccountId IS NULL
        DELETE FROM dbo.MonthlySnapshots;
    ELSE
        DELETE FROM dbo.MonthlySnapshots WHERE AccountId = @AccountId;

    INSERT INTO dbo.MonthlySnapshots (AccountId, SnapshotYear, SnapshotMonth, Profit, Loss, ExtraCost)
    SELECT
        AccountId,
        YEAR(TransactionDate)  AS SnapshotYear,
        MONTH(TransactionDate) AS SnapshotMonth,
        SUM(CASE WHEN TxType = 'Profit' THEN Amount ELSE 0 END) AS Profit,
        SUM(CASE WHEN TxType = 'Loss' THEN Amount ELSE 0 END) AS Loss,
        SUM(CASE WHEN Category = 'ExtraCost' THEN Amount ELSE 0 END) AS ExtraCost
    FROM dbo.Transactions
    WHERE (@AccountId IS NULL OR AccountId = @AccountId)
    GROUP BY AccountId, YEAR(TransactionDate), MONTH(TransactionDate);
END
GO

PRINT 'Stored procedures created successfully.';
GO

-- ────────────────────────────────────────────────────────────────
-- usp_SyncImportedBalances
-- Pure pass-through: copies the latest row per Kontonummer from
-- dbo.ImportedBalances onto dbo.Accounts (Balance/Haben/Soll/Betrag/
-- LastStatementDate/Status). NOTHING is recalculated or derived —
-- whatever the Excel said is exactly what ends up on the account and
-- what the dashboard shows.
--
-- If a Kontonummer from the import doesn't exist in dbo.Accounts yet,
-- a new account is created automatically (unassigned — CustomerId is
-- NULL until an Admin assigns it to a customer from Admin → Customers).
--
-- Run this once after you've loaded/refreshed dbo.ImportedBalances:
--   EXEC dbo.usp_SyncImportedBalances;
-- ────────────────────────────────────────────────────────────────
IF OBJECT_ID('dbo.usp_SyncImportedBalances', 'P') IS NOT NULL
    DROP PROCEDURE dbo.usp_SyncImportedBalances;
GO

CREATE PROCEDURE dbo.usp_SyncImportedBalances
AS
BEGIN
    SET NOCOUNT ON;

    -- Only the most recent import row per account (in case the same
    -- Kontonummer was imported more than once).
    ;WITH Latest AS (
        SELECT *,
               ROW_NUMBER() OVER (PARTITION BY Kontonummer ORDER BY ImportedAt DESC) AS rn
        FROM dbo.ImportedBalances
    )
    -- 1) Update accounts that already exist
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

    -- 2) Create accounts for any Kontonummer not seen before
    ;WITH Latest2 AS (
        SELECT *,
               ROW_NUMBER() OVER (PARTITION BY Kontonummer ORDER BY ImportedAt DESC) AS rn
        FROM dbo.ImportedBalances
    )
    INSERT INTO dbo.Accounts
        (AccountNumber, Label, CurrencyCode, Balance, Haben, Soll, Betrag, LastStatementDate, Status, IsActive, CustomerId)
    SELECT
        l.Kontonummer,
        l.Kontonummer,          -- placeholder label — rename it from Admin → Customers → manage accounts if you want a nicer name
        l.Currency,
        l.Saldo,
        l.Haben,
        l.Soll,
        l.Betrag,
        l.Datum,
        CASE WHEN l.AktivKonto = 0 THEN 'Inactive' ELSE 'Active' END,
        ISNULL(l.AktivKonto, 1),
        NULL                      -- unassigned; an Admin assigns it to a customer later
    FROM Latest2 l
    WHERE l.rn = 1
      AND NOT EXISTS (SELECT 1 FROM dbo.Accounts a WHERE a.AccountNumber = l.Kontonummer);
END
GO

PRINT 'usp_SyncImportedBalances created successfully.';
