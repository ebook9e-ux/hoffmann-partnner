// services/accountAccess.js
// Central place that decides whether the logged-in user is allowed to
// see/touch a given account. Used by every route that takes an
// :accountNumber param, so a customer can never reach another
// customer's data just by guessing/changing the number in the URL.

const { sql } = require('../config/db');

/**
 * Loads the account by AccountNumber and checks ownership.
 * Returns { account } on success, or { error, status } on failure.
 */
async function loadAccountForUser(pool, accountNumber, user) {
  const result = await pool.request()
    .input('accountNumber', sql.NVarChar, accountNumber)
    .query(`
      SELECT AccountId, AccountNumber, Label, AccountType, CurrencyCode,
             Balance, Score, Status, ExpenseLimit, IsActive, CustomerId, CreatedAt,
             Haben, Soll, Betrag, LastStatementDate
      FROM dbo.Accounts WHERE AccountNumber = @accountNumber
    `);

  const account = result.recordset[0];
  if (!account) {
    return { error: 'Account not found.', status: 404 };
  }

  if (user.role === 'customer' && account.CustomerId !== user.userId) {
    // 404 instead of 403 on purpose — a customer shouldn't be able to
    // tell "exists but not yours" apart from "doesn't exist".
    return { error: 'Account not found.', status: 404 };
  }

  return { account };
}

module.exports = { loadAccountForUser };
