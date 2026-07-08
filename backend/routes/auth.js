// routes/auth.js
// Application-managed authentication (no SQL Server Logins involved).
//
// Login flow:
//   1. Customer/Admin sends an identifier (their Username OR their Email)
//      plus their password
//   2. We look up dbo.Users by Username OR Email — whichever matches
//   3. bcrypt.compare() the password against the stored PasswordHash
//   4. If IsActive = 0 → login blocked, even with the correct password
//   5. Issue a JWT carrying { userId, username, fullName, role }.
//      When role = 'customer', every other route in the API uses
//      userId as the CustomerId to scope which Accounts are visible.

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { sql, poolPromise } = require('../config/db');
const { requireAuth } = require('../middleware/auth');
require('dotenv').config();

const router = express.Router();

// ── POST /api/auth/login ──────────────────────────────────────────
// Body: { username, password } — "username" may be either the actual
// Username or the account's Email; both work interchangeably.
router.post(
  '/login',
  [
    body('username').trim().notEmpty().withMessage('Username or email is required.'),
    body('password').notEmpty().withMessage('Password is required.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const identifier = req.body.username;
    const { password } = req.body;
    const genericError = 'نام کاربری/ایمیل یا رمز عبور اشتباه است. / Invalid username/email or password.';

    // Every attempt — success or fail — is logged so Admin → Analytics can
    // show "this customer tried to sign in and couldn't".
    async function logAttempt(pool, { userId = null, success, failReason = null }) {
      try {
        await pool.request()
          .input('userId', sql.Int, userId)
          .input('identifier', sql.NVarChar, identifier)
          .input('success', sql.Bit, success)
          .input('failReason', sql.NVarChar, failReason)
          .query(`
            INSERT INTO dbo.LoginAttempts (UserId, IdentifierTried, Success, FailReason)
            VALUES (@userId, @identifier, @success, @failReason)
          `);
      } catch (logErr) {
        console.error('Failed to record login attempt:', logErr);
      }
    }

    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('identifier', sql.NVarChar, identifier)
        .query(`
          SELECT UserId, Username, PasswordHash, FullName, CompanyName, Email, Phone, Role, IsActive
          FROM dbo.Users
          WHERE Username = @identifier OR Email = @identifier
        `);

      const userRecord = result.recordset[0];

      // Same generic message whether the identifier doesn't exist or the
      // password is wrong, so we never reveal which one it was.
      if (!userRecord) {
        await logAttempt(pool, { success: false, failReason: 'not_found' });
        return res.status(401).json({ error: genericError });
      }

      const passwordOk = await bcrypt.compare(password, userRecord.PasswordHash);
      if (!passwordOk) {
        await logAttempt(pool, { userId: userRecord.UserId, success: false, failReason: 'bad_password' });
        return res.status(401).json({ error: genericError });
      }

      if (!userRecord.IsActive) {
        await logAttempt(pool, { userId: userRecord.UserId, success: false, failReason: 'inactive' });
        return res.status(403).json({ error: 'این حساب کاربری غیرفعال شده است. / Account deactivated.' });
      }

      await logAttempt(pool, { userId: userRecord.UserId, success: true });

      await pool.request()
        .input('userId', sql.Int, userRecord.UserId)
        .query('UPDATE dbo.Users SET LastLoginAt = SYSUTCDATETIME() WHERE UserId = @userId');

      const token = jwt.sign(
        {
          userId: userRecord.UserId,
          username: userRecord.Username,
          fullName: userRecord.FullName,
          role: userRecord.Role,
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
      );

      res.json({
        token,
        user: {
          id: userRecord.UserId,
          fullName: userRecord.FullName,
          companyName: userRecord.CompanyName,
          username: userRecord.Username,
          email: userRecord.Email,
          phone: userRecord.Phone,
          role: userRecord.Role,
        },
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Server error.' });
    }
  }
);

// ── POST /api/auth/heartbeat ────────────────────────────────────
// Pinged by the frontend every ~45s while a user has the dashboard
// open. Just bumps LastSeenAt — that's the whole "online now" signal,
// checked by Admin → Customers (a user is "online" if LastSeenAt is
// within the last couple of minutes).
router.post('/heartbeat', requireAuth, async (req, res) => {
  // A heartbeat every ~45s also accumulates today's ActiveMinutes for this
  // user, capped at 2 minutes per beat so a tab left open overnight (or a
  // laptop woken up hours later) doesn't inflate the number — this is what
  // Admin → Analytics divides by an 8h business day to get "usage %".
  const MAX_MINUTES_PER_BEAT = 2;

  try {
    const pool = await poolPromise;
    await pool.request()
      .input('userId', sql.Int, req.user.userId)
      .query('UPDATE dbo.Users SET LastSeenAt = SYSUTCDATETIME() WHERE UserId = @userId');

    const existing = await pool.request()
      .input('userId', sql.Int, req.user.userId)
      .query(`
        SELECT LastHeartbeatAt FROM dbo.DailyUsage
        WHERE UserId = @userId AND UsageDate = CAST(SYSUTCDATETIME() AS DATE)
      `);

    let minutesToAdd = 0;
    const lastBeat = existing.recordset[0]?.LastHeartbeatAt;
    if (lastBeat) {
      const elapsedMinutes = (Date.now() - new Date(lastBeat).getTime()) / 60000;
      minutesToAdd = Math.max(0, Math.min(elapsedMinutes, MAX_MINUTES_PER_BEAT));
    }

    await pool.request()
      .input('userId', sql.Int, req.user.userId)
      .input('minutesToAdd', sql.Decimal(7, 2), minutesToAdd)
      .query(`
        MERGE dbo.DailyUsage AS target
        USING (SELECT @userId AS UserId, CAST(SYSUTCDATETIME() AS DATE) AS UsageDate) AS src
          ON target.UserId = src.UserId AND target.UsageDate = src.UsageDate
        WHEN MATCHED THEN
          UPDATE SET ActiveMinutes = target.ActiveMinutes + @minutesToAdd, LastHeartbeatAt = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN
          INSERT (UserId, UsageDate, ActiveMinutes, LastHeartbeatAt)
          VALUES (src.UserId, src.UsageDate, @minutesToAdd, SYSUTCDATETIME());
      `);

    res.json({ ok: true });
  } catch (err) {
    console.error('Heartbeat error:', err);
    res.status(500).json({ error: 'Failed to record heartbeat.' });
  }
});

module.exports = router;
