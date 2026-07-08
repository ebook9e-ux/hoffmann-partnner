// routes/dashboard.js
// Executive Dashboard endpoints. Every endpoint accepts the same
// optional query filters so the frontend slicers stay in sync:
//   ?period=current|3m|6m|9m|12m
//   ?accountNumber=...
//   ?status=Active|Medium|Inactive
//   ?currency=CHF|USD|EUR

const express = require('express');
const { sql, poolPromise } = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { resolvePeriodStartDate } = require('../services/period');

const router = express.Router();
router.use(requireAuth);

function buildAccountFilter(req, request, alias = 'a') {
  const clauses = [];

  // Customers only ever see their own accounts — enforced here so every
  // dashboard endpoint (KPIs, charts, tables, alerts) is scoped, not
  // just the account list.
  if (req.user.role === 'customer') {
    request.input('scopeCustomerId', sql.Int, req.user.userId);
    clauses.push(`${alias}.CustomerId = @scopeCustomerId`);
  } else if (req.query.customerId) {
    request.input('scopeCustomerId', sql.Int, req.query.customerId);
    clauses.push(`${alias}.CustomerId = @scopeCustomerId`);
  }

  if (req.query.accountNumber) {
    request.input('accountNumber', sql.NVarChar, req.query.accountNumber);
    clauses.push(`${alias}.AccountNumber = @accountNumber`);
  }
  if (req.query.status) {
    request.input('status', sql.NVarChar, req.query.status);
    clauses.push(`${alias}.Status = @status`);
  }
  if (req.query.currency) {
    request.input('currency', sql.NVarChar, req.query.currency);
    clauses.push(`${alias}.CurrencyCode = @currency`);
  }
  return clauses.length ? 'AND ' + clauses.join(' AND ') : '';
}

// ── GET /api/dashboard/kpis ─────────────────────────────────────
// The 7 top-of-page KPI cards.
router.get('/kpis', async (req, res) => {
  try {
    const pool = await poolPromise;
    const periodStart = resolvePeriodStartDate(req.query.period || 'current');

    const request = pool.request().input('periodStart', sql.DateTime2, periodStart);
    const accountFilter = buildAccountFilter(req, request);

    const result = await request.query(`
      SELECT
        (SELECT ISNULL(SUM(Balance), 0) FROM dbo.Accounts a WHERE 1=1 ${accountFilter}) AS TotalBalance,

        (SELECT ISNULL(SUM(t.Amount), 0)
           FROM dbo.Transactions t JOIN dbo.Accounts a ON a.AccountId = t.AccountId
           WHERE t.TxType = 'Profit' AND t.TransactionDate >= @periodStart ${accountFilter}) AS TotalProfit,

        (SELECT ISNULL(SUM(t.Amount), 0)
           FROM dbo.Transactions t JOIN dbo.Accounts a ON a.AccountId = t.AccountId
           WHERE t.TxType = 'Loss' AND t.TransactionDate >= @periodStart ${accountFilter}) AS TotalLoss,

        (SELECT ISNULL(SUM(t.Amount), 0)
           FROM dbo.Transactions t JOIN dbo.Accounts a ON a.AccountId = t.AccountId
           WHERE t.Category = 'ExtraCost' AND t.TransactionDate >= @periodStart ${accountFilter}) AS TotalExtraCost,

        (SELECT COUNT(*) FROM dbo.Accounts a WHERE a.Status = 'Active' ${accountFilter}) AS ActiveAccounts,
        (SELECT COUNT(*) FROM dbo.Accounts a WHERE a.Status = 'Inactive' ${accountFilter}) AS InactiveAccounts,
        (SELECT COUNT(*) FROM dbo.Accounts a WHERE a.Status = 'Medium' ${accountFilter}) AS WarningAccounts
    `);

    const r = result.recordset[0];
    res.json({
      totalBalance: Number(r.TotalBalance),
      totalProfit: Number(r.TotalProfit),
      totalLoss: Number(r.TotalLoss),
      totalExtraCost: Number(r.TotalExtraCost),
      activeAccounts: r.ActiveAccounts,
      inactiveAccounts: r.InactiveAccounts,
      warningAccounts: r.WarningAccounts,
    });
  } catch (err) {
    console.error('KPI error:', err);
    res.status(500).json({ error: 'Failed to compute KPIs.' });
  }
});

// ── GET /api/dashboard/accounts-status ──────────────────────────
// The status table: account number, status, score, profit, loss,
// extra cost, and whether it currently has any open alert.
router.get('/accounts-status', async (req, res) => {
  try {
    const pool = await poolPromise;
    const periodStart = resolvePeriodStartDate(req.query.period || 'current');

    const request = pool.request().input('periodStart', sql.DateTime2, periodStart);
    const accountFilter = buildAccountFilter(req, request);

    const result = await request.query(`
      SELECT
        a.AccountId, a.AccountNumber, a.Label, a.CurrencyCode, a.Status, a.Score,
        a.Balance, a.Haben, a.Soll, a.Betrag, a.LastStatementDate,
        ISNULL(SUM(CASE WHEN t.TxType = 'Profit' THEN t.Amount ELSE 0 END), 0) AS Profit,
        ISNULL(SUM(CASE WHEN t.TxType = 'Loss' THEN t.Amount ELSE 0 END), 0) AS Loss,
        ISNULL(SUM(CASE WHEN t.Category = 'ExtraCost' THEN t.Amount ELSE 0 END), 0) AS ExtraCost,
        (SELECT COUNT(*) FROM dbo.Alerts al WHERE al.AccountId = a.AccountId AND al.IsResolved = 0) AS OpenAlerts
      FROM dbo.Accounts a
      LEFT JOIN dbo.Transactions t
             ON t.AccountId = a.AccountId AND t.TransactionDate >= @periodStart
      WHERE 1=1 ${accountFilter}
      GROUP BY a.AccountId, a.AccountNumber, a.Label, a.CurrencyCode, a.Status, a.Score,
               a.Balance, a.Haben, a.Soll, a.Betrag, a.LastStatementDate
      ORDER BY a.AccountNumber ASC
    `);

    res.json(result.recordset.map((r) => ({
      accountId: r.AccountId,
      accountNumber: r.AccountNumber,
      label: r.Label,
      currency: r.CurrencyCode,
      status: r.Status,
      score: r.Score,
      profit: Number(r.Profit),
      loss: Number(r.Loss),
      extraCost: Number(r.ExtraCost),
      hasAlert: r.OpenAlerts > 0,
      // Raw values from the last SQL Server / Excel import — shown as-is,
      // not derived from Transactions or the scoring engine.
      saldo: r.Balance != null ? Number(r.Balance) : null,
      haben: r.Haben != null ? Number(r.Haben) : null,
      soll: r.Soll != null ? Number(r.Soll) : null,
      betrag: r.Betrag != null ? Number(r.Betrag) : null,
      statementDate: r.LastStatementDate,
    })));
  } catch (err) {
    console.error('Accounts status error:', err);
    res.status(500).json({ error: 'Failed to load account status table.' });
  }
});

// ── GET /api/dashboard/profit-loss-by-month ─────────────────────
// Feeds the column chart: Profit / Loss / ExtraCost per month.
router.get('/profit-loss-by-month', async (req, res) => {
  try {
    const pool = await poolPromise;
    const periodStart = resolvePeriodStartDate(req.query.period || '6m');

    const request = pool.request().input('periodStart', sql.DateTime2, periodStart);
    const accountFilter = buildAccountFilter(req, request, 'a');

    const result = await request.query(`
      SELECT
        s.SnapshotYear, s.SnapshotMonth,
        SUM(s.Profit) AS Profit, SUM(s.Loss) AS Loss, SUM(s.ExtraCost) AS ExtraCost
      FROM dbo.MonthlySnapshots s
      JOIN dbo.Accounts a ON a.AccountId = s.AccountId
      WHERE (s.SnapshotYear * 100 + s.SnapshotMonth) >=
            (YEAR(@periodStart) * 100 + MONTH(@periodStart))
            ${accountFilter}
      GROUP BY s.SnapshotYear, s.SnapshotMonth
      ORDER BY s.SnapshotYear ASC, s.SnapshotMonth ASC
    `);

    res.json(result.recordset.map((r) => ({
      year: r.SnapshotYear,
      month: r.SnapshotMonth,
      label: `${r.SnapshotYear}-${String(r.SnapshotMonth).padStart(2, '0')}`,
      profit: Number(r.Profit),
      loss: Number(r.Loss),
      extraCost: Number(r.ExtraCost),
    })));
  } catch (err) {
    console.error('Profit/loss by month error:', err);
    res.status(500).json({ error: 'Failed to load monthly profit/loss chart.' });
  }
});

// ── GET /api/dashboard/trend ─────────────────────────────────────
// Feeds the line chart — same shape as profit-loss-by-month but
// kept as a separate endpoint since the trend chart may evolve
// independently (e.g. add a forecast series later).
router.get('/trend', async (req, res) => {
  req.url = req.url.replace('/trend', '/profit-loss-by-month');
  return router.handle(req, res);
});

// ── GET /api/dashboard/status-distribution ──────────────────────
// Feeds the donut chart.
router.get('/status-distribution', async (req, res) => {
  try {
    const pool = await poolPromise;
    const request = pool.request();
    const accountFilter = buildAccountFilter(req, request);

    const result = await request.query(`
      SELECT Status, COUNT(*) AS Cnt
      FROM dbo.Accounts a
      WHERE 1=1 ${accountFilter}
      GROUP BY Status
    `);

    const counts = { Active: 0, Medium: 0, Inactive: 0 };
    result.recordset.forEach((r) => { counts[r.Status] = r.Cnt; });

    res.json([
      { name: 'Active', value: counts.Active, color: '#16C784' },
      { name: 'Medium', value: counts.Medium, color: '#F5A623' },
      { name: 'Inactive', value: counts.Inactive, color: '#F0454F' },
    ]);
  } catch (err) {
    console.error('Status distribution error:', err);
    res.status(500).json({ error: 'Failed to load status distribution.' });
  }
});

// ── GET /api/dashboard/top-extra-costs ───────────────────────────
// Top 10 accounts by extra cost within the selected period.
router.get('/top-extra-costs', async (req, res) => {
  try {
    const pool = await poolPromise;
    const periodStart = resolvePeriodStartDate(req.query.period || 'current');

    const request = pool.request().input('periodStart', sql.DateTime2, periodStart);
    const accountFilter = buildAccountFilter(req, request);

    const result = await request.query(`
      SELECT TOP 10
        a.AccountNumber, a.Label,
        SUM(t.Amount) AS ExtraCost
      FROM dbo.Transactions t
      JOIN dbo.Accounts a ON a.AccountId = t.AccountId
      WHERE t.Category = 'ExtraCost' AND t.TransactionDate >= @periodStart ${accountFilter}
      GROUP BY a.AccountNumber, a.Label
      ORDER BY SUM(t.Amount) DESC
    `);

    res.json(result.recordset.map((r) => ({
      accountNumber: r.AccountNumber,
      label: r.Label,
      extraCost: Number(r.ExtraCost),
    })));
  } catch (err) {
    console.error('Top extra costs error:', err);
    res.status(500).json({ error: 'Failed to load top extra costs.' });
  }
});

// ── GET /api/dashboard/alerts ─────────────────────────────────────
router.get('/alerts', async (req, res) => {
  try {
    const pool = await poolPromise;
    const request = pool.request();
    let scopeClause = '';
    if (req.user.role === 'customer') {
      request.input('scopeCustomerId', sql.Int, req.user.userId);
      scopeClause = 'AND a.CustomerId = @scopeCustomerId';
    }

    const result = await request.query(`
      SELECT al.AlertId, al.AccountId, a.AccountNumber, al.Severity,
             al.MessageKey, al.MessageText, al.CreatedAt
      FROM dbo.Alerts al
      LEFT JOIN dbo.Accounts a ON a.AccountId = al.AccountId
      WHERE al.IsResolved = 0 ${scopeClause}
      ORDER BY al.Severity ASC, al.CreatedAt DESC
    `);

    res.json(result.recordset.map((r) => ({
      id: r.AlertId,
      accountId: r.AccountId,
      accountNumber: r.AccountNumber,
      severity: r.Severity,
      key: r.MessageKey,
      message: r.MessageText,
      createdAt: r.CreatedAt,
    })));
  } catch (err) {
    console.error('Alerts error:', err);
    res.status(500).json({ error: 'Failed to load alerts.' });
  }
});

module.exports = router;
