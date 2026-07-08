// src/utils/print.js
// Drives both print modes used across the app.
//
// printSection(id): hides every [data-print-section] except the one
// matching id, opens the browser print dialog, then restores normal
// display afterwards.
//
// printFullDashboard(): just opens the print dialog as-is - the
// static rules in print.css already strip chrome (sidebar/topbar/
// buttons) and show the letterhead for a full-page printout.

let injectedStyleTag = null;

export function printSection(sectionId) {
  // CSS can't express "attribute X != attribute Y" statically, so we
  // inject a temporary <style> with the concrete id baked in: hide
  // every printable section, then show back only the targeted one.
  const css = `
    @media print {
      [data-print-section] { display: none !important; }
      [data-print-section="${cssEscape(sectionId)}"] { display: block !important; }
    }
  `;

  injectedStyleTag = document.createElement('style');
  injectedStyleTag.setAttribute('data-print-scope', 'section');
  injectedStyleTag.textContent = css;
  document.head.appendChild(injectedStyleTag);

  window.print();

  const cleanup = () => {
    if (injectedStyleTag) {
      injectedStyleTag.remove();
      injectedStyleTag = null;
    }
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  setTimeout(cleanup, 2000);
}

export function printFullDashboard() {
  window.print();
}

function cssEscape(value) {
  if (window.CSS && window.CSS.escape) return window.CSS.escape(value);
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}
