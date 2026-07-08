// routes/accountDetail.js
// Powers the drill-through "Account Details" page: KPIs, monthly
// profit/loss/extra-cost series, transaction history, and the FX
// rate relevant to that account's currency.
//
// Every route here first resolves the account by AccountNumber and
// checks ownership via loadAccountForUser() — a customer can never
// view another customer's account, even by editing the URL.

const express = require('express');
const { sql, poolPromise } = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { resolvePeriodStartDate } = require('../services/period');
const { loadAccountForUser } = require('../services/accountAccess');

const router = express.Router();
router.use(requireAuth);

router.get('/:accountNumber/detail', async (req, res) => {
  try {
    const pool = await poolPromise;
    const { account, error, status } = await loadAccountForUser(pool, req.params.accountNumber, req.user);
    if (error) return res.status(status).json({ error });

    res.json({
      accountId: account.AccountId,
      accountNumber: account.AccountNumber,
      label: account.Label,
      type: account.AccountType,
      currency: account.CurrencyCode,
      balance: Number(account.Balance),
      score: account.Score,
      status: account.Status,
      expenseLimit: Number(account.ExpenseLimit),
      isActive: !!account.IsActive,
      createdAt: account.CreatedAt,
      // Raw values from the last SQL Server / Excel import — shown as-is.
      haben: account.Haben != null ? Number(account.Haben) : null,
      soll: account.Soll != null ? Number(account.Soll) : null,
      betrag: account.Betrag != null ? Number(account.Betrag) : null,
      statementDate: account.LastStatementDate,
    });
  } catch (err) {
    console.error('Account detail error:', err);
    res.status(500).json({ error: 'Failed to load account.' });
  }
});

router.get('/:accountNumber/kpis', async (req, res) => {
  try {
    const pool = await poolPromise;
    const { account, error, status } = await loadAccountForUser(pool, req.params.accountNumber, req.user);
    if (error) return res.status(status).json({ error });

    const periodStart = resolvePeriodStartDate(req.query.period || '12m');

    const result = await pool.request()
      .input('accountId', sql.Int, account.AccountId)
      .input('periodStart', sql.DateTime2, periodStart)
      .query(`
        SELECT
          ISNULL(SUM(CASE WHEN TxType = 'Profit' THEN Amount ELSE 0 END), 0) AS TotalProfit,
          ISNULL(SUM(CASE WHEN TxType = 'Loss' THEN Amount ELSE 0 END), 0) AS TotalLoss,
          ISNULL(SUM(CASE WHEN Category = 'ExtraCost' THEN Amount ELSE 0 END), 0) AS ExtraExpenses,
          COUNT(DISTINCT CAST(YEAR(TransactionDate) AS VARCHAR) + '-' + CAST(MONTH(TransactionDate) AS VARCHAR)) AS ActiveMonths
        FROM dbo.Transactions
        WHERE AccountId = @accountId AND TransactionDate >= @periodStart;
      `);

    const r = result.recordset[0];
    const totalProfit = Number(r.TotalProfit);
    const totalLoss = Number(r.TotalLoss);
    const extraExpenses = Number(r.ExtraExpenses);
    const activeMonths = Math.max(r.ActiveMonths, 1);
    const netProfit = totalProfit - totalLoss;
    const profitMargin = totalProfit > 0 ? (netProfit / totalProfit) * 100 : 0;
    const expenseRatio = totalProfit > 0 ? (extraExpenses / totalProfit) * 100 : 0;

    res.json({
      totalProfit,
      totalLoss,
      netProfit,
      extraExpenses,
      profitMargin: Number(profitMargin.toFixed(2)),
      expenseRatio: Number(expenseRatio.toFixed(2)),
      avgMonthlyProfit: Number((totalProfit / activeMonths).toFixed(2)),
      avgMonthlyLoss: Number((totalLoss / activeMonths).toFixed(2)),
    });
  } catch (err) {
    console.error('Account KPIs error:', err);
    res.status(500).json({ error: 'Failed to compute account KPIs.' });
  }
});

router.get('/:accountNumber/monthly', async (req, res) => {
  try {
    const pool = await poolPromise;
    const { account, error, status } = await loadAccountForUser(pool, req.params.accountNumber, req.user);
    if (error) return res.status(status).json({ error });

    const periodStart = resolvePeriodStartDate(req.query.period || '12m');

    const result = await pool.request()
      .input('accountId', sql.Int, account.AccountId)
      .input('periodStart', sql.DateTime2, periodStart)
      .query(`
        SELECT SnapshotYear, SnapshotMonth, Profit, Loss, ExtraCost
        FROM dbo.MonthlySnapshots
        WHERE AccountId = @accountId
          AND (SnapshotYear * 100 + SnapshotMonth) >= (YEAR(@periodStart) * 100 + MONTH(@periodStart))
        ORDER BY SnapshotYear ASC, SnapshotMonth ASC;
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
    console.error('Account monthly error:', err);
    res.status(500).json({ error: 'Failed to load monthly series.' });
  }
});

router.get('/:accountNumber/transactions', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);

  try {
    const pool = await poolPromise;
    const { account, error, status } = await loadAccountForUser(pool, req.params.accountNumber, req.user);
    if (error) return res.status(status).json({ error });

    const result = await pool.request()
      .input('accountId', sql.Int, account.AccountId)
      .input('limit', sql.Int, limit)
      .query(`
        SELECT TOP (@limit) TransactionId, Description, Category, TxType, Amount, TransactionDate
        FROM dbo.Transactions
        WHERE AccountId = @accountId
        ORDER BY TransactionDate DESC;
      `);

    res.json(result.recordset.map((r) => ({
      id: r.TransactionId,
      description: r.Description,
      category: r.Category,
      type: r.TxType,
      amount: Number(r.Amount),
      date: r.TransactionDate,
    })));
  } catch (err) {
    console.error('Account transactions error:', err);
    res.status(500).json({ error: 'Failed to load transaction history.' });
  }
});

module.exports = router;
