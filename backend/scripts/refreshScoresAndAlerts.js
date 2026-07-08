// scripts/refreshScoresAndAlerts.js
// Run manually any time: npm run refresh
// Recalculates every account's score/status and regenerates the
// Alerts table. Useful right after a bulk data import.

require('dotenv').config();
const { poolPromise } = require('../config/db');

async function run() {
  const pool = await poolPromise;
  console.log('Recalculating account scores...');
  await pool.request().execute('usp_RecalculateAccountScore');
  console.log('Refreshing alerts...');
  await pool.request().execute('usp_RefreshAlerts');
  console.log('Done.');
  process.exit(0);
}

run().catch((err) => {
  console.error('Refresh failed:', err);
  process.exit(1);
});
