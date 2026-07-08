-- ════════════════════════════════════════════════════════════════
-- migration_admin_updates.sql
-- Adds to an EXISTING database:
--   1. dbo.Users.CompanyName        (printed on PDFs/reports alongside
--                                    Hoffmann & Partner AG)
--   2. dbo.LoginAttempts            every login try (success + fail),
--                                    powers Admin → Analytics "failed
--                                    sign-in" feed
--   3. dbo.DailyUsage               active minutes per user per day,
--                                    powers Admin → Analytics "usage %"
-- Only ADDS — never drops or touches existing data.
--
-- Run once:
--   sqlcmd -S localhost -U sa -P "YourPassword" -i migration_admin_updates.sql
-- ════════════════════════════════════════════════════════════════

USE AccountingDashboardDB;
GO

IF COL_LENGTH('dbo.Users', 'CompanyName') IS NULL
    ALTER TABLE dbo.Users ADD CompanyName NVARCHAR(200) NULL;
GO

-- ── dbo.LoginAttempts ────────────────────────────────────────────
-- One row per sign-in try, success or fail. UserId is NULL when the
-- typed username/email didn't match anyone (we still keep the text
-- they typed so Admin → Analytics can show "someone tried 'jon_smith'
-- and failed").
IF OBJECT_ID('dbo.LoginAttempts', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.LoginAttempts (
        AttemptId     INT IDENTITY(1,1) PRIMARY KEY,
        UserId        INT            NULL REFERENCES dbo.Users(UserId),
        IdentifierTried NVARCHAR(150) NOT NULL,
        Success       BIT            NOT NULL,
        FailReason    NVARCHAR(30)   NULL,   -- 'not_found' | 'bad_password' | 'inactive'
        AttemptedAt   DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_LoginAttempts_AttemptedAt ON dbo.LoginAttempts(AttemptedAt DESC);
    CREATE INDEX IX_LoginAttempts_UserId       ON dbo.LoginAttempts(UserId);
END
GO

-- ── dbo.DailyUsage ───────────────────────────────────────────────
-- One row per user per calendar day. ActiveMinutes accumulates from
-- the same ~45s heartbeat already used for "online now" — each
-- heartbeat adds the elapsed time since the previous one (capped so
-- a reopened tab after hours away doesn't count as active time).
IF OBJECT_ID('dbo.DailyUsage', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.DailyUsage (
        UsageId          INT IDENTITY(1,1) PRIMARY KEY,
        UserId           INT           NOT NULL REFERENCES dbo.Users(UserId),
        UsageDate        DATE          NOT NULL,
        ActiveMinutes    DECIMAL(7,2)  NOT NULL DEFAULT 0,
        LastHeartbeatAt  DATETIME2     NULL,
        CONSTRAINT UQ_DailyUsage UNIQUE (UserId, UsageDate)
    );
    CREATE INDEX IX_DailyUsage_Date ON dbo.DailyUsage(UsageDate DESC);
END
GO

PRINT 'Migration complete: CompanyName, LoginAttempts and DailyUsage are ready for the Admin Analytics dashboard.';
