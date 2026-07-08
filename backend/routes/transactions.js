// routes/transactions.js
// Recording a transaction also updates Balance and immediately
// re-runs the scoring/alert procedures for that account, so the
// dashboard reflects the change without waiting for the cron job.

const express = require('express');
const { body, validationResult } = require('express-validator');
const { sql, poolPromise } = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.post(
  '/',
  requireAdmin,
  [
    body('accountNumber').trim().notEmpty(),
    body('description').trim().notEmpty(),
    body('category').optional().trim(),
    body('type').isIn(['Profit', 'Loss']),
    body('amount').isFloat({ gt: 0 }).withMessage('Amount must be greater than zero.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const { accountNumber, description, category, type, amount } = req.body;
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);

    try {
      await transaction.begin();

      const accReq = new sql.Request(transaction);
      const accResult = await accReq
        .input('accountNumber', sql.NVarChar, accountNumber)
        .query('SELECT AccountId FROM dbo.Accounts WHERE AccountNumber = @accountNumber');

      const account = accResult.recordset[0];
      if (!account) {
        await transaction.rollback();
        return res.status(404).json({ error: 'Account not found.' });
      }

      const insertReq = new sql.Request(transaction);
      const inserted = await insertReq
        .input('accountId', sql.Int, account.AccountId)
        .input('description', sql.NVarChar, description)
        .input('category', sql.NVarChar, category || 'General')
        .input('type', sql.NVarChar, type)
        .input('amount', sql.Decimal(18, 2), amount)
        .query(`
          INSERT INTO dbo.Transactions (AccountId, Description, Category, TxType, Amount)
          OUTPUT INSERTED.TransactionId, INSERTED.TransactionDate
          VALUES (@accountId, @description, @category, @type, @amount)
        `);

      const balanceDelta = type === 'Profit' ? amount : -amount;
      const balReq = new sql.Request(transaction);
      await balReq
        .input('accountId', sql.Int, account.AccountId)
        .input('delta', sql.Decimal(18, 2), balanceDelta)
        .query('UPDATE dbo.Accounts SET Balance = Balance + @delta WHERE AccountId = @accountId');

      const now = new Date();
      const snapReq = new sql.Request(transaction);
      await snapReq
        .input('accountId', sql.Int, account.AccountId)
        .input('year', sql.Int, now.getUTCFullYear())
        .input('month', sql.Int, now.getUTCMonth() + 1)
        .input('profitDelta', sql.Decimal(18, 2), type === 'Profit' ? amount : 0)
        .input('lossDelta', sql.Decimal(18, 2), type === 'Loss' ? amount : 0)
        .input('extraCostDelta', sql.Decimal(18, 2), category === 'ExtraCost' ? amount : 0)
        .query(`
          MERGE dbo.MonthlySnapshots AS target
          USING (SELECT @accountId AS AccountId, @year AS Yr, @month AS Mo) AS src
          ON target.AccountId = src.AccountId AND target.SnapshotYear = src.Yr AND target.SnapshotMonth = src.Mo
          WHEN MATCHED THEN
            UPDATE SET Profit = target.Profit + @profitDelta,
                       Loss = target.Loss + @lossDelta,
                       ExtraCost = target.ExtraCost + @extraCostDelta
          WHEN NOT MATCHED THEN
            INSERT (AccountId, SnapshotYear, SnapshotMonth, Profit, Loss, ExtraCost)
            VALUES (@accountId, @year, @month, @profitDelta, @lossDelta, @extraCostDelta);
        `);

      await transaction.commit();

      try {
        const pool2 = await poolPromise;
        await pool2.request()
          .input('accountId', sql.Int, account.AccountId)
          .execute('usp_RecalculateAccountScore');
        await pool2.request().execute('usp_RefreshAlerts');
      } catch (scoreErr) {
        console.error('Post-transaction scoring failed (non-fatal):', scoreErr);
      }

      res.status(201).json({
        id: inserted.recordset[0].TransactionId,
        date: inserted.recordset[0].TransactionDate,
      });
    } catch (err) {
      await transaction.rollback();
      console.error('Create transaction error:', err);
      res.status(500).json({ error: 'Failed to record transaction.' });
    }
  }
);

module.exports = router;
