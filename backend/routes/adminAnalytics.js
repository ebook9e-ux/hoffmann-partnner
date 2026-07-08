// routes/adminAnalytics.js
// Admin-only. Replaces the old portfolio-wide "Übersichts-Dashboard" /
// "Kontodetails" views for the admin role with the two things an admin
// actually needs day-to-day:
//   1. How much of the dashboard each customer is actually using, per day
//   2. When a customer tried to sign in and could NOT get in (wrong
//      password, unknown username/email, or a deactivated account)

const express = require('express');
const { sql, poolPromise } = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireAdmin);

// A full business day, in minutes — the denominator for "usage %".
const BUSINESS_DAY_MINUTES = 8 * 60;

const FAIL_REASON_KEY = {
  not_found: 'failReasonNotFound',
  bad_password: 'failReasonBadPassword',
  inactive: 'failReasonInactive',
};

// ── GET /api/admin/analytics/usage?date=YYYY-MM-DD ──────────────
// Today's (or a given day's) usage % for every customer, plus a
// 7-day sparkline series per customer.
router.get('/usage', async (req, res) => {
  try {
    const pool = await poolPromise;
    const day = req.query.date || null;

    const today = await pool.request()
      .input('day', sql.Date, day)
      .query(`
        SELECT u.UserId, u.FullName, u.CompanyName, u.Username,
               ISNULL(du.ActiveMinutes, 0) AS ActiveMinutes,
               CASE WHEN u.LastSeenAt >= DATEADD(MINUTE, -2, SYSUTCDATETIME()) THEN 1 ELSE 0 END AS IsOnline
        FROM dbo.Users u
        LEFT JOIN dbo.DailyUsage du
               ON du.UserId = u.UserId
              AND du.UsageDate = COALESCE(@day, CAST(SYSUTCDATETIME() AS DATE))
        WHERE u.Role = 'customer'
        ORDER BY u.FullName ASC
      `);

    const history = await pool.request().query(`
      SELECT UserId, UsageDate, ActiveMinutes
      FROM dbo.DailyUsage
      WHERE UsageDate >= DATEADD(DAY, -7, CAST(SYSUTCDATETIME() AS DATE))
      ORDER BY UsageDate ASC
    `);

    const historyByUser = {};
    history.recordset.forEach((r) => {
      const key = r.UserId;
      if (!historyByUser[key]) historyByUser[key] = [];
      historyByUser[key].push({
        date: r.UsageDate,
        usagePercent: Math.min(100, Math.round((Number(r.ActiveMinutes) / BUSINESS_DAY_MINUTES) * 1000) / 10),
      });
    });

    res.json(today.recordset.map((r) => ({
      userId: r.UserId,
      fullName: r.FullName,
      companyName: r.CompanyName,
      username: r.Username,
      isOnline: !!r.IsOnline,
      activeMinutes: Number(r.ActiveMinutes),
      usagePercent: Math.min(100, Math.round((Number(r.ActiveMinutes) / BUSINESS_DAY_MINUTES) * 1000) / 10),
      history: historyByUser[r.UserId] || [],
    })));
  } catch (err) {
    console.error('Usage analytics error:', err);
    res.status(500).json({ error: 'Failed to load usage analytics.' });
  }
});

// ── GET /api/admin/analytics/login-attempts?limit=50&onlyFailed=true ─
router.get('/login-attempts', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const onlyFailed = req.query.onlyFailed !== 'false';

  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('limit', sql.Int, limit)
      .query(`
        SELECT TOP (@limit)
          la.AttemptId, la.IdentifierTried, la.Success, la.FailReason, la.AttemptedAt,
          u.UserId, u.FullName, u.CompanyName
        FROM dbo.LoginAttempts la
        LEFT JOIN dbo.Users u ON u.UserId = la.UserId
        ${onlyFailed ? 'WHERE la.Success = 0' : ''}
        ORDER BY la.AttemptedAt DESC
      `);

    res.json(result.recordset.map((r) => ({
      id: r.AttemptId,
      identifierTried: r.IdentifierTried,
      success: !!r.Success,
      failReason: r.FailReason,
      failReasonKey: FAIL_REASON_KEY[r.FailReason] || null,
      attemptedAt: r.AttemptedAt,
      userId: r.UserId,
      fullName: r.FullName,
      companyName: r.CompanyName,
    })));
  } catch (err) {
    console.error('Login attempts error:', err);
    res.status(500).json({ error: 'Failed to load login attempts.' });
  }
});

// ── GET /api/admin/analytics/summary ────────────────────────────
// The handful of KPI cards at the top of Admin → Analytics.
router.get('/summary', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT
        (SELECT COUNT(*) FROM dbo.Users WHERE Role = 'customer') AS TotalCustomers,
        (SELECT COUNT(*) FROM dbo.Users WHERE Role = 'customer'
           AND LastSeenAt >= DATEADD(MINUTE, -2, SYSUTCDATETIME())) AS OnlineNow,
        (SELECT ISNULL(AVG(ActiveMinutes), 0) FROM dbo.DailyUsage
           WHERE UsageDate = CAST(SYSUTCDATETIME() AS DATE)) AS AvgActiveMinutesToday,
        (SELECT COUNT(*) FROM dbo.LoginAttempts
           WHERE Success = 0 AND AttemptedAt >= CAST(SYSUTCDATETIME() AS DATE)) AS FailedLoginsToday,
        (SELECT COUNT(*) FROM dbo.LoginAttempts
           WHERE Success = 0 AND AttemptedAt >= DATEADD(HOUR, -24, SYSUTCDATETIME())) AS FailedLogins24h
    `);
    const r = result.recordset[0];
    res.json({
      totalCustomers: r.TotalCustomers,
      onlineNow: r.OnlineNow,
      avgUsagePercentToday: Math.min(100, Math.round((Number(r.AvgActiveMinutesToday) / BUSINESS_DAY_MINUTES) * 1000) / 10),
      failedLoginsToday: r.FailedLoginsToday,
      failedLogins24h: r.FailedLogins24h,
    });
  } catch (err) {
    console.error('Analytics summary error:', err);
    res.status(500).json({ error: 'Failed to load analytics summary.' });
  }
});

module.exports = router;
