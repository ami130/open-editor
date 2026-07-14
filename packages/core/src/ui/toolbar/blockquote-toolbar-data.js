/**
 * blockquote-toolbar-data.js — pure data for the blockquote toolbar (style
 * presets, default accents, swatch palette). A leaf module both
 * blockquote-toolbar.js and blockquote-toolbar-dom.js import from, which breaks
 * the former circular import between those two files.
 */

export const BQ_STYLES = [
  { key: 'border',          label: 'Border',       colorLabel: 'Border color:' },
  { key: 'card',            label: 'Card',          colorLabel: 'Card color:'   },
  { key: 'pull',            label: 'Pull quote',    colorLabel: 'Line color:'   },
  { key: 'callout-info',    label: '💡 Info',       colorLabel: 'Accent color:' },
  { key: 'callout-warning', label: '⚠️ Warning',    colorLabel: 'Accent color:' },
  { key: 'callout-success', label: '✅ Success',    colorLabel: 'Accent color:' },
  { key: 'callout-danger',  label: '❌ Danger',     colorLabel: 'Accent color:' },
];

export const DEFAULT_STYLE_KEY = 'border';

// Default accent colors per style (shown as pre-selected swatch on first open).
export const DEFAULT_ACCENT = {
  'border':          '#c5c5c5',
  'card':            '#e0e0e0',
  'pull':            '#333333',
  'callout-info':    '#1e88e5',
  'callout-warning': '#f5c518',
  'callout-success': '#43a047',
  'callout-danger':  '#e53935',
};

export const BLOCKQUOTE_BORDER_COLORS = [
  '#c5c5c5',
  '#e53935',
  '#f97316',
  '#f5c518',
  '#43a047',
  '#1e88e5',
  '#8e24aa',
  '#00acc1',
  '#6d4c41',
  '#1a1a1a',
];
