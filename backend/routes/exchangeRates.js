// routes/exchangeRates.js
// Reads from dbo.ExchangeRates, which you update yourself (manually
// or via your own job/script). This API only ever reads it.

const express = require('express');
const { sql, poolPromise } = require('../config/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// All 6 directional pairs across the 3 tracked currencies — CHF, USD
// and EUR each have their own dedicated bank account (an account only
// ever holds one currency), so every conversion direction between them
// is tracked independently.
const TRACKED_PAIRS = [
  ['CHF', 'USD'],
  ['USD', 'CHF'],
  ['CHF', 'EUR'],
  ['EUR', 'CHF'],
  ['EUR', 'USD'],
  ['USD', 'EUR'],
];

// ── GET /api/exchange-rates/latest ──────────────────────────────
// Latest rate for each tracked pair.
router.get('/latest', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT r.FromCurrency, r.ToCurrency, r.Rate, r.RecordedAt
      FROM dbo.ExchangeRates r
      INNER JOIN (
        SELECT FromCurrency, ToCurrency, MAX(RecordedAt) AS MaxRecordedAt
        FROM dbo.ExchangeRates
        GROUP BY FromCurrency, ToCurrency
      ) latest
        ON latest.FromCurrency = r.FromCurrency
       AND latest.ToCurrency = r.ToCurrency
       AND latest.MaxRecordedAt = r.RecordedAt
      ORDER BY r.FromCurrency, r.ToCurrency
    `);

    const byPair = {};
    result.recordset.forEach((r) => {
      byPair[`${r.FromCurrency}_${r.ToCurrency}`] = {
        from: r.FromCurrency,
        to: r.ToCurrency,
        rate: Number(r.Rate),
        recordedAt: r.RecordedAt,
      };
    });

    // Always return all 4 tracked pairs, even if one has no data yet
    const rates = TRACKED_PAIRS.map(([from, to]) => {
      const key = `${from}_${to}`;
      return byPair[key] || { from, to, rate: null, recordedAt: null };
    });

    res.json(rates);
  } catch (err) {
    console.error('Exchange rates error:', err);
    res.status(500).json({ error: 'Failed to load exchange rates.' });
  }
});

// ── GET /api/exchange-rates/history?from=CHF&to=USD&days=30 ─────
router.get('/history', async (req, res) => {
  const { from, to } = req.query;
  const days = Math.min(parseInt(req.query.days, 10) || 30, 365);

  if (!from || !to) {
    return res.status(400).json({ error: 'from and to currency codes are required.' });
  }

  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('from', sql.NVarChar, from)
      .input('to', sql.NVarChar, to)
      .input('days', sql.Int, days)
      .query(`
        SELECT Rate, RecordedAt
        FROM dbo.ExchangeRates
        WHERE FromCurrency = @from AND ToCurrency = @to
          AND RecordedAt >= DATEADD(DAY, -@days, SYSUTCDATETIME())
        ORDER BY RecordedAt ASC
      `);

    res.json(result.recordset.map((r) => ({
      rate: Number(r.Rate),
      recordedAt: r.RecordedAt,
    })));
  } catch (err) {
    console.error('Exchange rate history error:', err);
    res.status(500).json({ error: 'Failed to load exchange rate history.' });
  }
});

// ── GET /api/exchange-rates/monthly-pl ──────────────────────────
// Monthly FX revaluation profit/loss for each held currency, valued
// in CHF (the reporting/base currency — every customer's CHF account
// only ever holds CHF, so CHF itself carries no revaluation).
//
// For USD and EUR: pl = balance_held * (rate_now→CHF - rate_at_month_start→CHF)
// A positive number means that currency strengthened against CHF since
// the 1st of the month (a paper gain on the balance held in it); a
// negative number means it weakened (a paper loss).
router.get('/monthly-pl', async (req, res) => {
  try {
    const pool = await poolPromise;

    const balanceRequest = pool.request();
    const scopeClauses = [];
    if (req.user.role === 'customer') {
      balanceRequest.input('scopeCustomerId', sql.Int, req.user.userId);
      scopeClauses.push('CustomerId = @scopeCustomerId');
    } else if (req.query.customerId) {
      balanceRequest.input('scopeCustomerId', sql.Int, req.query.customerId);
      scopeClauses.push('CustomerId = @scopeCustomerId');
    }
    const scopeSql = scopeClauses.length ? `AND ${scopeClauses.join(' AND ')}` : '';

    const balances = await balanceRequest.query(`
      SELECT CurrencyCode, SUM(Balance) AS TotalBalance
      FROM dbo.Accounts
      WHERE 1=1 ${scopeSql}
      GROUP BY CurrencyCode
    `);
    const balanceByCurrency = {};
    balances.recordset.forEach((r) => { balanceByCurrency[r.CurrencyCode] = Number(r.TotalBalance); });

    async function rateToChf(currency, beforeDate) {
      if (currency === 'CHF') return 1;
      const request = pool.request().input('from', sql.NVarChar, currency);
      let dateClause = '';
      if (beforeDate) {
        request.input('beforeDate', sql.DateTime2, beforeDate);
        dateClause = 'AND RecordedAt <= @beforeDate';
      }
      const result = await request.query(`
        SELECT TOP 1 Rate FROM dbo.ExchangeRates
        WHERE FromCurrency = @from AND ToCurrency = 'CHF' ${dateClause}
        ORDER BY RecordedAt DESC
      `);
      return result.recordset[0] ? Number(result.recordset[0].Rate) : null;
    }

    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));

    const currencies = ['CHF', 'USD', 'EUR'];
    const rows = await Promise.all(currencies.map(async (currency) => {
      const balance = balanceByCurrency[currency] || 0;
      if (currency === 'CHF') {
        return {
          currency, balance, rateNow: 1, rateMonthStart: 1, profitLoss: 0, isBaseCurrency: true,
        };
      }
      const rateNow = await rateToChf(currency, null);
      const rateMonthStart = await rateToChf(currency, monthStart);
      const profitLoss = (rateNow != null && rateMonthStart != null)
        ? Math.round(balance * (rateNow - rateMonthStart) * 100) / 100
        : null;
      return {
        currency, balance, rateNow, rateMonthStart, profitLoss, isBaseCurrency: false,
      };
    }));

    res.json(rows);
  } catch (err) {
    console.error('FX monthly P/L error:', err);
    res.status(500).json({ error: 'Failed to compute FX monthly profit/loss.' });
  }
});

module.exports = router;
