// config/db.js
// Central SQL Server connection pool. All routes import { poolPromise }
// from here and reuse one shared pool — never open a connection per-request.

require('dotenv').config();
const sql = require('mssql');

const config = {
  server: process.env.DB_SERVER,
  port: parseInt(process.env.DB_PORT || '1433', 10),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
    enableArithAbort: true,
  },
  pool: {
    max: 15,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

const poolPromise = new sql.ConnectionPool(config)
  .connect()
  .then((pool) => {
    console.log('✅ Connected to SQL Server:', process.env.DB_NAME);
    return pool;
  })
  .catch((err) => {
    console.error('❌ SQL Server connection failed:', err.message);
    throw err;
  });

module.exports = { sql, poolPromise };
