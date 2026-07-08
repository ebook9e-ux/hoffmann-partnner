// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');

const { sql, poolPromise } = require('./config/db');
const authRoutes = require('./routes/auth');
const customerRoutes = require('./routes/customers');
const accountRoutes = require('./routes/accounts');
const accountDetailRoutes = require('./routes/accountDetail');
const transactionRoutes = require('./routes/transactions');
const dashboardRoutes = require('./routes/dashboard');
const exchangeRateRoutes = require('./routes/exchangeRates');
const exportRoutes = require('./routes/export');
const adminAnalyticsRoutes = require('./routes/adminAnalytics');

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use(express.json());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many attempts. Please try again later.' },
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/admin/customers', customerRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/accounts', accountDetailRoutes); // adds /:accountNumber/* sub-routes
app.use('/api/transactions', transactionRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/exchange-rates', exchangeRateRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/admin/analytics', adminAnalyticsRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Unexpected server error.' });
});

// ── Background refresh: recalculate scores + alerts on a schedule ──
// This is what keeps the Status/Score columns and the Alerts feed
// current even if no one is actively recording transactions right now.
const cronExpr = process.env.REFRESH_CRON || '*/15 * * * *';
cron.schedule(cronExpr, async () => {
  try {
    const pool = await poolPromise;
    await pool.request().execute('usp_RecalculateAccountScore');
    await pool.request().execute('usp_RefreshAlerts');
    console.log(`[${new Date().toISOString()}] Scores and alerts refreshed.`);
  } catch (err) {
    console.error('Scheduled refresh failed:', err);
  }
});

const PORT = process.env.PORT || 4000;
if(process.env.NODE_ENV != "production"){
app.listen(PORT, () => {
  console.log(`🚀 API server running on http://localhost:${PORT}`);
  console.log(`⏱  Auto-refresh schedule: ${cronExpr}`);
});
}
module.exports =app;
/*
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 API server running on http://localhost:${PORT}`);
  console.log(`⏱  Auto-refresh schedule: ${cronExpr}`);
});
*/
