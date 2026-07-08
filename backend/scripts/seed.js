// scripts/seed.js
// Creates the first Admin login, two demo Customer logins, and seeds
// sample accounts/transactions — assigning accounts to customers so
// you can see the multi-tenant scoping working end to end.
//
// Usage: npm run seed

require('dotenv').config();
const sql = require('mssql');
const bcrypt = require('bcryptjs');

async function seed() {
  const pool = await new sql.ConnectionPool({
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
  }).connect();

  console.log('Connected to SQL Server.');

  // ── Step 1: Create the Admin + two demo Customers ────────────────
  console.log('\nSeeding users...');
  const users = [
    { username: 'admin_demo',   password: 'Admin@2024!',   fullName: 'Admin User',      companyName: null,               email: 'admin@ledgeriq.demo',   phone: '+41 44 000 00 00', role: 'admin' },
    { username: 'acme_corp',    password: 'Acme@2024!',    fullName: 'Acme Corp AG',     companyName: 'Acme Corp AG',      email: 'finance@acme.demo',     phone: '+41 44 111 22 33', role: 'customer' },
    { username: 'nova_trading', password: 'Nova@2024!',    fullName: 'Nova Trading Ltd', companyName: 'Nova Trading Ltd',  email: 'accounts@nova.demo',    phone: '+41 44 222 33 44', role: 'customer' },
  ];

  const userIds = {};
  for (const u of users) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    const result = await pool.request()
      .input('username', sql.NVarChar, u.username)
      .input('passwordHash', sql.NVarChar, passwordHash)
      .input('fullName', sql.NVarChar, u.fullName)
      .input('companyName', sql.NVarChar, u.companyName)
      .input('email', sql.NVarChar, u.email)
      .input('phone', sql.NVarChar, u.phone)
      .input('role', sql.NVarChar, u.role)
      .query(`
        MERGE dbo.Users AS target
        USING (SELECT @username AS Username) AS src
        ON target.Username = src.Username
        WHEN MATCHED THEN
          UPDATE SET PasswordHash = @passwordHash, FullName = @fullName, CompanyName = @companyName, Email = @email, Phone = @phone, Role = @role, IsActive = 1
        WHEN NOT MATCHED THEN
          INSERT (Username, PasswordHash, FullName, CompanyName, Email, Phone, Role, IsActive)
          VALUES (@username, @passwordHash, @fullName, @companyName, @email, @phone, @role, 1)
        OUTPUT INSERTED.UserId;
      `);
    userIds[u.username] = result.recordset[0].UserId;
    console.log(`  User seeded: ${u.username} (${u.role})`);
  }

  // ── Step 2: Seed demo accounts, split between the two customers ──
  console.log('\nSeeding accounts...');
  const accounts = [
    { number: '100101', label: 'Zurich Main',    currency: 'CHF', limit: 4000, owner: 'acme_corp' },
    { number: '100102', label: 'Geneva Branch',  currency: 'CHF', limit: 4000, owner: 'acme_corp' },
    { number: '100201', label: 'New York Desk',  currency: 'USD', limit: 5000, owner: 'acme_corp' },
    { number: '100245', label: 'Boston Reserve', currency: 'USD', limit: 3500, owner: 'nova_trading' },
    { number: '100301', label: 'Frankfurt Hub',  currency: 'EUR', limit: 4200, owner: 'nova_trading' },
    { number: '100312', label: 'Milan Branch',   currency: 'EUR', limit: 3000, owner: 'nova_trading' },
  ];

  const accountIds = {};
  for (const a of accounts) {
    const r = await pool.request()
      .input('num', sql.NVarChar, a.number)
      .input('label', sql.NVarChar, a.label)
      .input('currency', sql.NVarChar, a.currency)
      .input('limit', sql.Decimal(18, 2), a.limit)
      .input('customerId', sql.Int, userIds[a.owner])
      .query(`
        MERGE dbo.Accounts AS target
        USING (SELECT @num AS AccountNumber) AS src
        ON target.AccountNumber = src.AccountNumber
        WHEN MATCHED THEN
          UPDATE SET CustomerId = @customerId
        WHEN NOT MATCHED THEN
          INSERT (AccountNumber, Label, CurrencyCode, ExpenseLimit, Balance, Score, Status, CustomerId)
          VALUES (@num, @label, @currency, @limit, 0, 15, 'Active', @customerId)
        OUTPUT INSERTED.AccountId;
      `);
    if (r.recordset.length > 0) accountIds[a.number] = r.recordset[0].AccountId;
    else {
      const ex = await pool.request()
        .input('num', sql.NVarChar, a.number)
        .query('SELECT AccountId FROM dbo.Accounts WHERE AccountNumber = @num');
      accountIds[a.number] = ex.recordset[0].AccountId;
    }
    console.log(`  Account seeded: ${a.number} — ${a.label} → owner: ${a.owner}`);
  }

  // ── Step 3: Seed sample transactions ────────────────────────────
  console.log('\nSeeding sample transactions...');
  const now = new Date();
  for (const [num, accountId] of Object.entries(accountIds)) {
    let balance = 0;
    for (let mo = 5; mo >= 0; mo--) {
      const txDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - mo, 15));
      const profit = Math.round(2000 + Math.random() * 5000);
      const loss   = Math.round(500  + Math.random() * 2000);
      const extra  = Math.random() > 0.6 ? Math.round(500 + Math.random() * 3000) : 0;

      await pool.request()
        .input('aId', sql.Int, accountId)
        .input('profit', sql.Decimal(18, 2), profit)
        .input('loss', sql.Decimal(18, 2), loss)
        .input('txDate', sql.DateTime2, txDate)
        .query(`
          INSERT INTO dbo.Transactions (AccountId, Description, Category, TxType, Amount, TransactionDate)
          VALUES (@aId, 'Revenue booking', 'General', 'Profit', @profit, @txDate),
                 (@aId, 'Operating cost',  'General', 'Loss',   @loss,   @txDate);
        `);

      if (extra > 0) {
        await pool.request()
          .input('aId', sql.Int, accountId)
          .input('extra', sql.Decimal(18, 2), extra)
          .input('txDate', sql.DateTime2, txDate)
          .query(`
            INSERT INTO dbo.Transactions (AccountId, Description, Category, TxType, Amount, TransactionDate)
            VALUES (@aId, 'Unplanned expense', 'ExtraCost', 'Loss', @extra, @txDate);
          `);
      }
      balance += profit - loss - extra;
    }
    await pool.request()
      .input('aId', sql.Int, accountId)
      .input('bal', sql.Decimal(18, 2), balance)
      .query('UPDATE dbo.Accounts SET Balance = @bal WHERE AccountId = @aId');
  }

  // ── Step 4: Rebuild snapshots + scores ──────────────────────────
  console.log('\nRebuilding snapshots and scores...');
  await pool.request().execute('usp_RebuildMonthlySnapshot');
  await pool.request().execute('usp_RecalculateAccountScore');
  await pool.request().execute('usp_RefreshAlerts');

  // ── Step 5: Seed exchange rates (all 6 directional pairs) ────────
  for (const [from, to, rate] of [
    ['CHF', 'USD', 1.12], ['USD', 'CHF', 0.89],
    ['CHF', 'EUR', 1.04], ['EUR', 'CHF', 0.96],
    ['EUR', 'USD', 1.08], ['USD', 'EUR', 0.93],
  ]) {
    await pool.request()
      .input('from', sql.NVarChar, from)
      .input('to', sql.NVarChar, to)
      .input('rate', sql.Decimal(18, 6), rate)
      .query('INSERT INTO dbo.ExchangeRates (FromCurrency,ToCurrency,Rate) VALUES (@from,@to,@rate)');
  }

  await pool.close();

  console.log('\n✅ Seed complete.');
  console.log('──────────────────────────────────────────────');
  console.log('  Admin:    username=admin_demo    password=Admin@2024!');
  console.log('            → sees everything, manages customers in Admin → Customers');
  console.log('');
  console.log('  Customer: username=acme_corp     password=Acme@2024!');
  console.log('            → sees only accounts 100101 / 100102 / 100201');
  console.log('');
  console.log('  Customer: username=nova_trading  password=Nova@2024!');
  console.log('            → sees only accounts 100245 / 100301 / 100312');
  console.log('');
  console.log('  To create new customers going forward, log in as admin_demo and');
  console.log('  use the "Customers" screen — no manual SQL needed.');
  console.log('──────────────────────────────────────────────');
  process.exit(0);
}

seed().catch((err) => { console.error('Seed failed:', err); process.exit(1); });
