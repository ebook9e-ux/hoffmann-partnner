// services/period.js
// Translates a slicer value ('current' | '3m' | '6m' | '9m' | '12m')
// into a concrete start date, shared by every route that respects
// the month-range filter.

const PERIOD_MONTHS = {
  current: 0, // handled specially: just the current calendar month
  '3m': 3,
  '6m': 6,
  '9m': 9,
  '12m': 12,
};

function resolvePeriodStartDate(period) {
  const months = PERIOD_MONTHS[period];
  const now = new Date();

  if (period === 'current' || months === 0) {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }

  const monthsBack = months ?? 6; // default to 6 months if an unknown value sneaks in
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsBack + 1, 1));
  return d;
}

module.exports = { resolvePeriodStartDate, PERIOD_MONTHS };
