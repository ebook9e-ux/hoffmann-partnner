// src/components/branding/HoffmannPartnerLogo.jsx
// Simple recreation of the Hoffmann & Partner wordmark (two navy bars +
// company name) as inline SVG, so it renders crisply at any size without
// shipping a raster image file.

import React from 'react';

export default function HoffmannPartnerLogo({ height = 40, dark = false, className = '' }) {
  const navy = dark ? '#ffffff' : '#16284d';
  return (
    <svg
      viewBox="0 0 300 80"
      height={height}
      className={className}
      role="img"
      aria-label="Hoffmann Partner"
      style={{ display: 'block' }}
    >
      {/* Left bar — full height */}
      <rect x="0" y="4" width="14" height="72" fill={navy} />
      {/* Right bar — split into two segments with a gap */}
      <rect x="28" y="4" width="14" height="30" fill={navy} />
      <rect x="28" y="46" width="14" height="30" fill={navy} />

      <text
        x="58"
        y="38"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="30"
        fill={navy}
      >
        Hoffmann
      </text>
      <text
        x="58"
        y="70"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="30"
        fill={navy}
      >
        Partner
      </text>
    </svg>
  );
}
