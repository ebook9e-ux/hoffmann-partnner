-- ════════════════════════════════════════════════════════════════
-- AccountingDashboardDB — schema (application-managed authentication)
-- Passwords are hashed (bcrypt) and stored in dbo.Users.PasswordHash.
-- The company Admin creates each customer's username/password from
-- inside the app (Admin → Customers). Customers only ever see the
-- accounts assigned to them (dbo.Accounts.CustomerId).
--
-- Run once:
--   sqlcmd -S localhost -U sa -P "YourPassword" -i schema.sql
-- ════════════════════════════════════════════════════════════════

IF DB_ID('AccountingDashboardDB') IS NULL
    CREATE DATABASE AccountingDashboardDB;
GO

USE AccountingDashboardDB;
GO

-- ── dbo.Users ────────────────────────────────────────────────────
-- Holds both back-office Admins and Customers in one table, told
-- apart by Role. PasswordHash is a bcrypt hash — the app never
-- stores or logs a plaintext password after the moment it's created.
IF OBJECT_ID('dbo.Users', 'U') IS NOT NULL DROP TABLE dbo.Users;
CREATE TABLE dbo.Users (
    UserId       INT IDENTITY(1,1) PRIMARY KEY,
    Username     NVARCHAR(128)  NOT NULL UNIQUE,
    PasswordHash NVARCHAR(255)  NOT NULL,
    Email        NVARCHAR(150)  NULL,
    Phone        NVARCHAR(30)   NULL,
    FullName     NVARCHAR(150)  NOT NULL,
    Role         NVARCHAR(30)   NOT NULL DEFAULT 'customer',  -- 'admin' | 'customer'
    IsActive     BIT            NOT NULL DEFAULT 1,           -- 0 = login blocked, 1 = allowed
    CreatedAt    DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    LastLoginAt  DATETIME2      NULL,
    LastSeenAt   DATETIME2      NULL,  -- updated every ~45s by the app while the user has it open; used for the "online now" indicator
    CompanyName  NVARCHAR(200)  NULL   -- printed on PDFs/reports alongside the Hoffmann & Partner AG letterhead
);
GO

CREATE INDEX IX_Users_Role ON dbo.Users(Role);
GO

-- Email is optional, but when set it must be unique — the login screen
-- accepts either Username or Email interchangeably, so two accounts
-- sharing an email would make that email ambiguous to log in with.
CREATE UNIQUE INDEX UX_Users_Email ON dbo.Users(Email) WHERE Email IS NOT NULL;
GO

-- Customer accounts, their username/password/email/phone, and which
-- Accounts they can see are all managed from Admin → Customers in the
-- app UI (POST /api/admin/customers). No manual SQL Server Login
-- steps are needed anymore — this table is the single source of truth.

-- ── dbo.Accounts ─────────────────────────────────────────────────
-- CustomerId ties an account to the one customer allowed to view it.
-- NULL = not yet assigned to any customer (only Admins can see it).
IF OBJECT_ID('dbo.Accounts', 'U') IS NOT NULL DROP TABLE dbo.Accounts;
CREATE TABLE dbo.Accounts (
    AccountId     INT IDENTITY(1,1) PRIMARY KEY,
    AccountNumber NVARCHAR(40)   NOT NULL UNIQUE,
    Label         NVARCHAR(100)  NOT NULL,
    AccountType   NVARCHAR(50)   NOT NULL DEFAULT N'جاری',
    CurrencyCode  NVARCHAR(3)    NOT NULL DEFAULT 'CHF',
    Balance       DECIMAL(18,2)  NOT NULL DEFAULT 0,
    Score         INT            NOT NULL DEFAULT 15,
    Status        NVARCHAR(20)   NOT NULL DEFAULT 'Active',
    ExpenseLimit  DECIMAL(18,2)  NOT NULL DEFAULT 5000,
    IsActive      BIT            NOT NULL DEFAULT 1,
    CustomerId    INT            NULL REFERENCES dbo.Users(UserId),
    CreatedAt     DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    -- ── Raw values from the Excel/SQL Server import (see ImportedBalances
    -- below) — copied over as-is by usp_SyncImportedBalances, with NO
    -- recalculation. Score/Status above stay driven by the Transactions-
    -- based scoring engine; these four columns are just a pass-through
    -- display of whatever the last import said.
    Haben              DECIMAL(18,2) NULL,
    Soll               DECIMAL(18,2) NULL,
    Betrag             DECIMAL(18,2) NULL,
    LastStatementDate  DATE          NULL
);
GO

CREATE INDEX IX_Accounts_Status   ON dbo.Accounts(Status);
CREATE INDEX IX_Accounts_Currency ON dbo.Accounts(CurrencyCode);
CREATE INDEX IX_Accounts_Customer ON dbo.Accounts(CustomerId);
GO

-- ── dbo.ImportedBalances ─────────────────────────────────────────
-- Landing table for the three Excel sheets (EUR / USD / CHF). You
-- import each sheet in here with the exact same columns it already
-- has — no formulas, no recalculation. dbo.usp_SyncImportedBalances
-- (in procedures.sql) then copies these values as-is onto dbo.Accounts
-- so the dashboard shows exactly what the Excel said.
--
-- One row per account per import. If you re-import later, just insert
-- new rows — usp_SyncImportedBalances always uses the most recent
-- ImportedAt per Kontonummer.
IF OBJECT_ID('dbo.ImportedBalances', 'U') IS NOT NULL DROP TABLE dbo.ImportedBalances;
CREATE TABLE dbo.ImportedBalances (
    ImportId    INT IDENTITY(1,1) PRIMARY KEY,
    Kontonummer NVARCHAR(40)   NOT NULL,   -- kontonumber
    Currency    NVARCHAR(3)    NOT NULL,   -- 'EUR' | 'USD' | 'CHF' — set this per sheet at import time
    Saldo       DECIMAL(18,2)  NULL,       -- saldo
    Haben       DECIMAL(18,2)  NULL,       -- haben
    Soll        DECIMAL(18,2)  NULL,       -- soll
    Betrag      DECIMAL(18,2)  NULL,       -- betragen
    AktivKonto  BIT            NULL,       -- active kont (1 = active, 0 = inactive)
    Datum       DATE           NULL,       -- datum
    ImportedAt  DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

CREATE INDEX IX_ImportedBalances_Konto ON dbo.ImportedBalances(Kontonummer);
GO

-- ── dbo.Transactions ─────────────────────────────────────────────
IF OBJECT_ID('dbo.Transactions', 'U') IS NOT NULL DROP TABLE dbo.Transactions;
CREATE TABLE dbo.Transactions (
    TransactionId   INT IDENTITY(1,1) PRIMARY KEY,
    AccountId       INT            NOT NULL REFERENCES dbo.Accounts(AccountId) ON DELETE CASCADE,
    Description     NVARCHAR(255)  NOT NULL,
    Category        NVARCHAR(50)   NOT NULL DEFAULT 'General',
    TxType          NVARCHAR(10)   NOT NULL DEFAULT 'Profit',
    Amount          DECIMAL(18,2)  NOT NULL,
    TransactionDate DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    CreatedAt       DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_Transactions_TxType CHECK (TxType IN ('Profit','Loss')),
    CONSTRAINT CK_Transactions_Amount CHECK (Amount >= 0)
);
GO

CREATE INDEX IX_Transactions_AccountId_Date ON dbo.Transactions(AccountId, TransactionDate DESC);
CREATE INDEX IX_Transactions_Category       ON dbo.Transactions(Category);
GO

-- ── dbo.MonthlySnapshots ─────────────────────────────────────────
IF OBJECT_ID('dbo.MonthlySnapshots', 'U') IS NOT NULL DROP TABLE dbo.MonthlySnapshots;
CREATE TABLE dbo.MonthlySnapshots (
    SnapshotId    INT IDENTITY(1,1) PRIMARY KEY,
    AccountId     INT           NOT NULL REFERENCES dbo.Accounts(AccountId) ON DELETE CASCADE,
    SnapshotYear  INT           NOT NULL,
    SnapshotMonth INT           NOT NULL,
    Profit        DECIMAL(18,2) NOT NULL DEFAULT 0,
    Loss          DECIMAL(18,2) NOT NULL DEFAULT 0,
    ExtraCost     DECIMAL(18,2) NOT NULL DEFAULT 0,
    CONSTRAINT UQ_MonthlySnapshots UNIQUE (AccountId, SnapshotYear, SnapshotMonth)
);
GO

CREATE INDEX IX_MonthlySnapshots_Period ON dbo.MonthlySnapshots(SnapshotYear, SnapshotMonth);
GO

-- ── dbo.ExchangeRates ────────────────────────────────────────────
IF OBJECT_ID('dbo.ExchangeRates', 'U') IS NOT NULL DROP TABLE dbo.ExchangeRates;
CREATE TABLE dbo.ExchangeRates (
    RateId       INT IDENTITY(1,1) PRIMARY KEY,
    FromCurrency NVARCHAR(3)    NOT NULL,
    ToCurrency   NVARCHAR(3)    NOT NULL,
    Rate         DECIMAL(18,6)  NOT NULL,
    RecordedAt   DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

CREATE INDEX IX_ExchangeRates_Pair ON dbo.ExchangeRates(FromCurrency, ToCurrency, RecordedAt DESC);
GO

-- ── dbo.Alerts ───────────────────────────────────────────────────
IF OBJECT_ID('dbo.Alerts', 'U') IS NOT NULL DROP TABLE dbo.Alerts;
CREATE TABLE dbo.Alerts (
    AlertId     INT IDENTITY(1,1) PRIMARY KEY,
    AccountId   INT           NULL REFERENCES dbo.Accounts(AccountId) ON DELETE CASCADE,
    Severity    NVARCHAR(10)  NOT NULL DEFAULT 'critical',
    MessageKey  NVARCHAR(50)  NOT NULL,
    MessageText NVARCHAR(400) NOT NULL,
    CreatedAt   DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    IsResolved  BIT           NOT NULL DEFAULT 0
);
GO

CREATE INDEX IX_Alerts_Unresolved ON dbo.Alerts(IsResolved, CreatedAt DESC);
GO

-- ── dbo.LoginAttempts ────────────────────────────────────────────
-- Every sign-in try, success or fail — feeds Admin → Analytics so the
-- admin can see when a customer tried to sign in and couldn't.
IF OBJECT_ID('dbo.LoginAttempts', 'U') IS NOT NULL DROP TABLE dbo.LoginAttempts;
CREATE TABLE dbo.LoginAttempts (
    AttemptId       INT IDENTITY(1,1) PRIMARY KEY,
    UserId          INT            NULL REFERENCES dbo.Users(UserId),
    IdentifierTried NVARCHAR(150)  NOT NULL,
    Success         BIT            NOT NULL,
    FailReason      NVARCHAR(30)   NULL,   -- 'not_found' | 'bad_password' | 'inactive'
    AttemptedAt     DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
CREATE INDEX IX_LoginAttempts_AttemptedAt ON dbo.LoginAttempts(AttemptedAt DESC);
CREATE INDEX IX_LoginAttempts_UserId       ON dbo.LoginAttempts(UserId);
GO

-- ── dbo.DailyUsage ───────────────────────────────────────────────
-- One row per user per calendar day — active minutes accumulated from
-- the heartbeat, feeds the Admin → Analytics "daily usage %" metric.
IF OBJECT_ID('dbo.DailyUsage', 'U') IS NOT NULL DROP TABLE dbo.DailyUsage;
CREATE TABLE dbo.DailyUsage (
    UsageId          INT IDENTITY(1,1) PRIMARY KEY,
    UserId           INT           NOT NULL REFERENCES dbo.Users(UserId),
    UsageDate        DATE          NOT NULL,
    ActiveMinutes    DECIMAL(7,2)  NOT NULL DEFAULT 0,
    LastHeartbeatAt  DATETIME2     NULL,
    CONSTRAINT UQ_DailyUsage UNIQUE (UserId, UsageDate)
);
GO
CREATE INDEX IX_DailyUsage_Date ON dbo.DailyUsage(UsageDate DESC);
GO

PRINT 'Schema created successfully.';
PRINT 'Create the first Admin with: node scripts/seed.js';
PRINT 'From then on, all customers/passwords are managed from Admin -> Customers in the app.';
GO
