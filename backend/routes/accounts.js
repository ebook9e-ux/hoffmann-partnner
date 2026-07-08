// routes/accounts.js
const express = require('express');
const { body, validationResult } = require('express-validator');
const { sql, poolPromise } = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Customers only ever see accounts assigned to them (CustomerId = their
// own UserId). Admins see everything, optionally filtered by ?customerId=.
router.get('/', async (req, res) => {
  try {
    const pool = await poolPromise;
    const request = pool.request();
    let where = '1=1';

    if (req.user.role === 'customer') {
      request.input('customerId', sql.Int, req.user.userId);
      where = 'CustomerId = @customerId';
    } else if (req.query.customerId) {
      request.input('customerId', sql.Int, req.query.customerId);
      where = 'CustomerId = @customerId';
    } else if (req.query.unassigned === 'true') {
      where = 'CustomerId IS NULL';
    }

    const result = await request.query(`
      SELECT AccountId, AccountNumber, Label, CurrencyCode, Status, CustomerId
      FROM dbo.Accounts
      WHERE ${where}
      ORDER BY AccountNumber ASC
    `);
    res.json(result.recordset.map((r) => ({
      id: r.AccountId,
      accountNumber: r.AccountNumber,
      label: r.Label,
      currency: r.CurrencyCode,
      status: r.Status,
      customerId: r.CustomerId,
    })));
  } catch (err) {
    console.error('List accounts error:', err);
    res.status(500).json({ error: 'Failed to load accounts.' });
  }
});

router.post(
  '/',
  requireAdmin,
  [
    body('accountNumber').trim().notEmpty(),
    body('label').trim().notEmpty(),
    body('currencyCode').isIn(['CHF', 'USD', 'EUR']),
    body('customerId').optional({ checkFalsy: true }).isInt(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const { accountNumber, label, accountType, currencyCode, expenseLimit, customerId } = req.body;

    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('accountNumber', sql.NVarChar, accountNumber)
        .input('label', sql.NVarChar, label)
        .input('accountType', sql.NVarChar, accountType || 'Current')
        .input('currencyCode', sql.NVarChar, currencyCode)
        .input('expenseLimit', sql.Decimal(18, 2), expenseLimit || 5000)
        .input('customerId', sql.Int, customerId || null)
        .query(`
          INSERT INTO dbo.Accounts (AccountNumber, Label, AccountType, CurrencyCode, ExpenseLimit, Balance, Score, Status, CustomerId)
          OUTPUT INSERTED.AccountId, INSERTED.AccountNumber, INSERTED.Label, INSERTED.Status, INSERTED.CustomerId
          VALUES (@accountNumber, @label, @accountType, @currencyCode, @expenseLimit, 0, 15, 'Active', @customerId)
        `);

      res.status(201).json(result.recordset[0]);
    } catch (err) {
      if (err.number === 2627) {
        return res.status(409).json({ error: 'This account number already exists.' });
      }
      console.error('Create account error:', err);
      res.status(500).json({ error: 'Failed to create account.' });
    }
  }
);

module.exports = router;
