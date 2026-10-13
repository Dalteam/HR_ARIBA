// Inline Tabler outline icons for printed documents (the print windows don't load the Tabler webfont).
const SHAPES: Record<string, string> = {
  calendar: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M16 3v4M8 3v4M4 11h16"/>',
  award: '<circle cx="12" cy="9" r="6"/><path d="M12 15l3.4 5.89 1.6-3.23 3.6.23-3.4-5.89M6.8 12l-3.4 5.89 3.6-.23 1.6 3.23 3.4-5.89"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M3 12h1M12 3v1M20 12h1M12 20v1M5.6 5.6l.7.7M18.4 5.6l-.7.7M17.7 17.7l.7.7M6.3 17.7l-.7.7"/>',
  cash: '<rect x="7" y="9" width="14" height="10" rx="2"/><circle cx="14" cy="14" r="2"/><path d="M17 9V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/>',
  plus: '<circle cx="12" cy="12" r="9"/><path d="M9 12h6M12 9v6"/>',
  minus: '<circle cx="12" cy="12" r="9"/><path d="M9 12h6"/>',
  certificate: '<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M5 8V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2h-5"/><circle cx="6" cy="14" r="3"/><path d="M4.5 17L3 22l3-1.5L9 22l-1.5-5"/>',
  id: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M15 8h2M15 12h2M7 16h10"/>',
};

export type PrintIcon = keyof typeof SHAPES;

export const printIcon = (name: PrintIcon, size = 13) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-inline-end:4px">${SHAPES[name]}</svg>`;
