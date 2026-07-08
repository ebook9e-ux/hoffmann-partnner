// routes/export.js
// On-demand exports of the account status table. Excel uses ExcelJS
// (streams an .xlsx); PDF uses PDFKit (streams a simple tabular report).

const express = require('express');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { sql, poolPromise } = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { resolvePeriodStartDate } = require('../services/period');

const router = express.Router();
router.use(requireAuth);

async function fetchAccountsStatus(period, user) {
  const pool = await poolPromise;
  const periodStart = resolvePeriodStartDate(period || 'current');

  const request = pool.request().input('periodStart', sql.DateTime2, periodStart);
  let scopeClause = '';
  if (user.role === 'customer') {
    request.input('scopeCustomerId', sql.Int, user.userId);
    scopeClause = 'AND a.CustomerId = @scopeCustomerId';
  }

  const result = await request.query(`
      SELECT
        a.AccountNumber, a.Label, a.CurrencyCode, a.Status, a.Score,
        ISNULL(SUM(CASE WHEN t.TxType = 'Profit' THEN t.Amount ELSE 0 END), 0) AS Profit,
        ISNULL(SUM(CASE WHEN t.TxType = 'Loss' THEN t.Amount ELSE 0 END), 0) AS Loss,
        ISNULL(SUM(CASE WHEN t.Category = 'ExtraCost' THEN t.Amount ELSE 0 END), 0) AS ExtraCost
      FROM dbo.Accounts a
      LEFT JOIN dbo.Transactions t
             ON t.AccountId = a.AccountId AND t.TransactionDate >= @periodStart
      WHERE 1=1 ${scopeClause}
      GROUP BY a.AccountNumber, a.Label, a.CurrencyCode, a.Status, a.Score
      ORDER BY a.AccountNumber ASC
    `);

  return result.recordset;
}

// Company name printed in the letterhead of every export — the signed-in
// customer's own company (falls back to their full name), alongside the
// Hoffmann & Partner AG brand that operates the dashboard.
async function fetchLetterheadName(user) {
  if (user.role !== 'customer') return null;
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('userId', sql.Int, user.userId)
      .query('SELECT CompanyName, FullName FROM dbo.Users WHERE UserId = @userId');
    const r = result.recordset[0];
    return r ? (r.CompanyName || r.FullName) : null;
  } catch {
    return null;
  }
}

router.get('/excel', async (req, res) => {
  try {
    const rows = await fetchAccountsStatus(req.query.period, req.user);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Account Status');

    sheet.columns = [
      { header: 'Account Number', key: 'num', width: 20 },
      { header: 'Label', key: 'label', width: 24 },
      { header: 'Currency', key: 'currency', width: 10 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Score', key: 'score', width: 8 },
      { header: 'Profit', key: 'profit', width: 16 },
      { header: 'Loss', key: 'loss', width: 16 },
      { header: 'Extra Cost', key: 'extraCost', width: 16 },
    ];
    sheet.getRow(1).font = { bold: true };

    const letterheadName = await fetchLetterheadName(req.user);
    sheet.insertRow(1, [`Hoffmann & Partner AG${letterheadName ? ` — ${letterheadName}` : ''}`]);
    sheet.getRow(1).font = { bold: true, size: 13 };
    sheet.mergeCells(1, 1, 1, 8);
    sheet.insertRow(2, []); // blank spacer row between the letterhead and the column headers
    sheet.getRow(3).font = { bold: true }; // column headers, shifted down by the two rows above

    rows.forEach((r) => {
      sheet.addRow({
        num: r.AccountNumber,
        label: r.Label,
        currency: r.CurrencyCode,
        status: r.Status,
        score: r.Score,
        profit: Number(r.Profit),
        loss: Number(r.Loss),
        extraCost: Number(r.ExtraCost),
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=account-status.xlsx');

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Excel export error:', err);
    res.status(500).json({ error: 'Failed to generate Excel export.' });
  }
});

router.get('/pdf', async (req, res) => {
  try {
    const rows = await fetchAccountsStatus(req.query.period, req.user);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=account-status.pdf');

    const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape' });
    doc.pipe(res);

    const letterheadName = await fetchLetterheadName(req.user);
    doc.fontSize(14).fillColor('#16284d').text('Hoffmann & Partner AG', { align: 'left' });
    if (letterheadName) {
      doc.fontSize(11).fillColor('#333').text(letterheadName, { align: 'left' });
    }
    doc.moveDown(0.4);
    doc.fontSize(16).fillColor('#000').text('Account Status Report', { align: 'left' });
    doc.fontSize(9).fillColor('#666').text(new Date().toLocaleString(), { align: 'left' });
    doc.moveDown(1);

    const colX = [36, 160, 320, 400, 480, 560, 680, 800];
    const headers = ['Account #', 'Label', 'Currency', 'Status', 'Score', 'Profit', 'Loss', 'Extra Cost'];

    doc.fontSize(9).fillColor('#000');
    headers.forEach((h, i) => doc.text(h, colX[i], doc.y, { continued: false }));
    doc.moveDown(0.5);
    doc.moveTo(36, doc.y).lineTo(806, doc.y).strokeColor('#ccc').stroke();
    doc.moveDown(0.3);

    rows.forEach((r) => {
      const y = doc.y;
      doc.fontSize(8).fillColor('#000');
      doc.text(r.AccountNumber, colX[0], y, { width: 110 });
      doc.text(r.Label, colX[1], y, { width: 150 });
      doc.text(r.CurrencyCode, colX[2], y, { width: 60 });
      doc.text(r.Status, colX[3], y, { width: 70 });
      doc.text(String(r.Score), colX[4], y, { width: 50 });
      doc.text(Number(r.Profit).toFixed(2), colX[5], y, { width: 100 });
      doc.text(Number(r.Loss).toFixed(2), colX[6], y, { width: 100 });
      doc.text(Number(r.ExtraCost).toFixed(2), colX[7], y, { width: 100 });
      doc.moveDown(0.6);
    });

    doc.end();
  } catch (err) {
    console.error('PDF export error:', err);
    res.status(500).json({ error: 'Failed to generate PDF export.' });
  }
});

module.exports = router;
