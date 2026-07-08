// src/components/kpi/KpiCard.jsx
import React from 'react';

// tone drives both the top accent bar color and the value text color:
// 'green' | 'yellow' | 'red' | 'blue'
export default function KpiCard({ label, value, sub, tone = 'blue', icon }) {
  return (
    <div className={`kpi-card tone-${tone}`}>
      <div className="kpi-top">
        <span className="kpi-label">{label}</span>
        <span className={`kpi-icon tone-${tone}-text`}>{icon}</span>
      </div>
      <div className={`kpi-value tone-${tone}-text`}>{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}
