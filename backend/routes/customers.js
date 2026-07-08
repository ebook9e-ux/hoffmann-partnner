// routes/customers.js
// Admin-only customer management.
//   - Admin creates a customer's Username + Password (or auto-generates
//     a strong password) plus Email/Phone, and hands those credentials
//     to the customer directly.
//   - Admin assigns which Accounts that customer is allowed to see.
//   - The customer then logs in with those exact credentials and only
//     ever sees their own assigned accounts (enforced server-side in
//     every dashboard/account/transaction route, not just the UI).

const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { isValidPhoneNumber } = require('libphonenumber-js');
const { sql, poolPromise } = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { generatePassword } = require('../utils/generatePassword');

// Real international validation (covers every country's numbering plan,
// not just a length/format guess) — requires the number to include a
// country code, e.g. +41 44 111 22 33 or +1 415 555 0132.
function isValidInternationalPhone(value) {
  try {
    return isValidPhoneNumber(value);
  } catch {
    return false;
  }
}

const router = express.Router();
router.use(requireAuth, requireAdmin);

// A user counts as "online" if we've heard a heartbeat from them in
// the last 2 minutes (heartbeats are sent every ~45s while the app is
// open, so this comfortably survives one missed beat).
const ONLINE_THRESHOLD_MINUTES = 2;

function toCustomerDto(r) {
  return {
    id: r.UserId,
    username: r.Username,
    fullName: r.FullName,
    companyName: r.CompanyName,
    email: r.Email,
    phone: r.Phone,
    role: r.Role,
    isActive: !!r.IsActive,
    accountCount: r.AccountCount ?? undefined,
    createdAt: r.CreatedAt,
    lastLoginAt: r.LastLoginAt,
    isOnline: !!r.IsOnline,
  };
}

// ── GET /api/admin/customers ────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT u.UserId, u.Username, u.FullName, u.CompanyName, u.Email, u.Phone, u.Role,
             u.IsActive, u.CreatedAt, u.LastLoginAt,
             CASE WHEN u.LastSeenAt >= DATEADD(MINUTE, -${ONLINE_THRESHOLD_MINUTES}, SYSUTCDATETIME()) THEN 1 ELSE 0 END AS IsOnline,
             (SELECT COUNT(*) FROM dbo.Accounts a WHERE a.CustomerId = u.UserId) AS AccountCount
      FROM dbo.Users u
      WHERE u.Role = 'customer'
      ORDER BY u.CreatedAt DESC
    `);
    res.json(result.recordset.map(toCustomerDto));
  } catch (err) {
    console.error('List customers error:', err);
    res.status(500).json({ error: 'Failed to load customers.' });
  }
});

// ── GET /api/admin/customers/online-summary ─────────────────────
// Small, cheap payload meant to be polled every ~20-30s by the
// "online now" widget in the sidebar — just who's active right now.
router.get('/online-summary', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT UserId, Username, FullName, Role
      FROM dbo.Users
      WHERE LastSeenAt >= DATEADD(MINUTE, -${ONLINE_THRESHOLD_MINUTES}, SYSUTCDATETIME())
      ORDER BY FullName ASC
    `);
    const users = result.recordset.map((r) => ({
      id: r.UserId,
      username: r.Username,
      fullName: r.FullName,
      role: r.Role,
    }));
    res.json({ count: users.length, users });
  } catch (err) {
    console.error('Online summary error:', err);
    res.status(500).json({ error: 'Failed to load online status.' });
  }
});

// ── POST /api/admin/customers ───────────────────────────────────
// Body: { username, fullName, email?, phone?, password? }
// If password is omitted, a strong one is generated and returned
// ONCE in the response so the Admin can hand it to the customer.
router.post(
  '/',
  [
    body('username').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters.')
      .matches(/^[a-zA-Z0-9._-]+$/).withMessage('Username can only contain letters, numbers, dots, dashes and underscores.'),
    body('fullName').trim().notEmpty().withMessage('Full name is required.'),
    body('companyName').optional({ checkFalsy: true }).trim().isLength({ max: 200 }),
    body('email').trim().notEmpty().withMessage('Email is required.')
      .isEmail().withMessage('Invalid email address.').normalizeEmail(),
    body('phone').trim().notEmpty().withMessage('Phone number is required.')
      .custom((value) => isValidInternationalPhone(value))
      .withMessage('Invalid phone number. Include the country code, e.g. +41 44 111 22 33.'),
    body('password').optional({ checkFalsy: true }).isLength({ min: 8 }).withMessage('Password must be at least 8 characters.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const { username, fullName, companyName, email, phone } = req.body;
    const plainPassword = req.body.password || generatePassword();

    try {
      const pool = await poolPromise;
      const passwordHash = await bcrypt.hash(plainPassword, 10);

      const result = await pool.request()
        .input('username', sql.NVarChar, username)
        .input('passwordHash', sql.NVarChar, passwordHash)
        .input('fullName', sql.NVarChar, fullName)
        .input('companyName', sql.NVarChar, companyName || null)
        .input('email', sql.NVarChar, email || null)
        .input('phone', sql.NVarChar, phone || null)
        .query(`
          INSERT INTO dbo.Users (Username, PasswordHash, FullName, CompanyName, Email, Phone, Role, IsActive)
          OUTPUT INSERTED.UserId, INSERTED.Username, INSERTED.FullName, INSERTED.CompanyName, INSERTED.Email,
                 INSERTED.Phone, INSERTED.Role, INSERTED.IsActive, INSERTED.CreatedAt
          VALUES (@username, @passwordHash, @fullName, @companyName, @email, @phone, 'customer', 1)
        `);

      res.status(201).json({
        customer: toCustomerDto(result.recordset[0]),
        // Only ever sent back on creation — store it nowhere server-side.
        generatedPassword: req.body.password ? undefined : plainPassword,
      });
    } catch (err) {
      if (err.number === 2627) {
        return res.status(409).json({ error: 'This username already exists.' });
      }
      if (err.number === 2601 && /UX_Users_Email/i.test(err.message || '')) {
        return res.status(409).json({ error: 'A customer with this email already exists.' });
      }
      console.error('Create customer error:', err);
      res.status(500).json({ error: 'Failed to create customer.' });
    }
  }
);

// ── PATCH /api/admin/customers/:id ──────────────────────────────
// Update fullName / email / phone / isActive (activate = 1 / deactivate = 0).
router.patch(
  '/:id',
  [
    body('email').optional({ checkFalsy: true }).trim().isEmail().withMessage('Invalid email address.').normalizeEmail(),
    body('phone').optional({ checkFalsy: true }).trim()
      .custom((value) => isValidInternationalPhone(value))
      .withMessage('Invalid phone number. Include the country code, e.g. +41 44 111 22 33.'),
    body('companyName').optional({ checkFalsy: true }).trim().isLength({ max: 200 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const { id } = req.params;
    const { fullName, companyName, email, phone, isActive } = req.body;

    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('id', sql.Int, id)
        .input('fullName', sql.NVarChar, fullName ?? null)
        .input('companyName', sql.NVarChar, companyName ?? null)
        .input('email', sql.NVarChar, email ?? null)
        .input('phone', sql.NVarChar, phone ?? null)
        .input('isActive', sql.Bit, typeof isActive === 'boolean' ? isActive : null)
        .query(`
          UPDATE dbo.Users SET
            FullName    = COALESCE(@fullName, FullName),
            CompanyName = COALESCE(@companyName, CompanyName),
            Email       = COALESCE(@email, Email),
            Phone       = COALESCE(@phone, Phone),
            IsActive    = COALESCE(@isActive, IsActive)
          OUTPUT INSERTED.UserId, INSERTED.Username, INSERTED.FullName, INSERTED.CompanyName, INSERTED.Email,
                 INSERTED.Phone, INSERTED.Role, INSERTED.IsActive, INSERTED.CreatedAt, INSERTED.LastLoginAt
          WHERE UserId = @id AND Role = 'customer'
        `);

      if (!result.recordset[0]) return res.status(404).json({ error: 'Customer not found.' });
      res.json(toCustomerDto(result.recordset[0]));
    } catch (err) {
      if (err.number === 2601 && /UX_Users_Email/i.test(err.message || '')) {
        return res.status(409).json({ error: 'A customer with this email already exists.' });
      }
      console.error('Update customer error:', err);
      res.status(500).json({ error: 'Failed to update customer.' });
    }
  }
);

// ── POST /api/admin/customers/:id/reset-password ────────────────
// Body: { password? } — if omitted, a new strong password is generated.
router.post('/:id/reset-password', async (req, res) => {
  const { id } = req.params;
  const plainPassword = (req.body && req.body.password) || generatePassword();

  if (plainPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  try {
    const pool = await poolPromise;
    const passwordHash = await bcrypt.hash(plainPassword, 10);

    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('passwordHash', sql.NVarChar, passwordHash)
      .query(`
        UPDATE dbo.Users SET PasswordHash = @passwordHash
        OUTPUT INSERTED.UserId, INSERTED.Username
        WHERE UserId = @id AND Role = 'customer'
      `);

    if (!result.recordset[0]) return res.status(404).json({ error: 'Customer not found.' });

    res.json({
      username: result.recordset[0].Username,
      newPassword: plainPassword,
    });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Failed to reset password.' });
  }
});

// ── GET /api/admin/customers/:id/accounts ───────────────────────
router.get('/:id/accounts', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`
        SELECT AccountId, AccountNumber, Label, CurrencyCode, Balance, Status
        FROM dbo.Accounts WHERE CustomerId = @id
        ORDER BY AccountNumber ASC
      `);
    res.json(result.recordset.map((r) => ({
      id: r.AccountId,
      accountNumber: r.AccountNumber,
      label: r.Label,
      currency: r.CurrencyCode,
      balance: Number(r.Balance),
      status: r.Status,
    })));
  } catch (err) {
    console.error('List customer accounts error:', err);
    res.status(500).json({ error: 'Failed to load customer accounts.' });
  }
});

// ── PUT /api/admin/customers/:id/accounts/:accountId ────────────
// Assign an existing account to this customer.
router.put('/:id/accounts/:accountId', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('accountId', sql.Int, req.params.accountId)
      .query(`
        UPDATE dbo.Accounts SET CustomerId = @id
        OUTPUT INSERTED.AccountId, INSERTED.AccountNumber, INSERTED.CustomerId
        WHERE AccountId = @accountId
      `);
    if (!result.recordset[0]) return res.status(404).json({ error: 'Account not found.' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Assign account error:', err);
    res.status(500).json({ error: 'Failed to assign account.' });
  }
});

// ── DELETE /api/admin/customers/:id/accounts/:accountId ─────────
// Unassign (account becomes admin-only again).
router.delete('/:id/accounts/:accountId', async (req, res) => {
  try {
    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('accountId', sql.Int, req.params.accountId)
      .query(`
        UPDATE dbo.Accounts SET CustomerId = NULL
        WHERE AccountId = @accountId AND CustomerId = @id
      `);
    res.json({ ok: true });
  } catch (err) {
    console.error('Unassign account error:', err);
    res.status(500).json({ error: 'Failed to unassign account.' });
  }
});

module.exports = router;
