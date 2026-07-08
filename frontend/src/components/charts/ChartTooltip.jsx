// src/components/charts/ChartTooltip.jsx
import React from 'react';

// Drop-in replacement for Recharts' default <Tooltip content={...} />.
// Expects the standard { active, payload, label } props Recharts passes.
export default function ChartTooltip({ active, payload, label, formatter }) {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="chart-tooltip">
      {label && <div className="chart-tooltip-title">{label}</div>}
      {payload.map((entry, i) => (
        <div className="chart-tooltip-row" key={i}>
          <span className="chart-tooltip-dot" style={{ background: entry.color || entry.fill }} />
          <span className="chart-tooltip-label">{entry.name}</span>
          <span className="chart-tooltip-value">
            {formatter ? formatter(entry.value, entry.name) : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}
