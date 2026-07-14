/**
 * Default toolbar layout and item descriptor shape (7.11 / 7.14 / 7.15).
 *
 * An item is one of:
 *   { type: 'button', name, command, icon, labelKey }
 *   { type: 'dropdown', name, kind, labelKey }   // kind: heading|fontFamily|fontSize|lineHeight
 *   { type: 'color', name, kind, icon, labelKey } // kind: textColor|bgColor
 *   { type: 'separator' }
 *
 * Custom buttons use the SAME button descriptor as built-ins (7.15):
 *   { type:'button', name, command, icon:'<svg…>', tooltip:'…', isActive? }
 *
 * The config is a list of GROUPS; each group is a list of items. Groups render
 * with a separator between them (text / block / insert / align / history / view).
 */

export const DEFAULT_TOOLBAR = [
  // text
  [
    { type: 'button', name: 'bold',          command: 'bold',          icon: 'bold',          labelKey: 'bold' },
    { type: 'button', name: 'italic',        command: 'italic',        icon: 'italic',        labelKey: 'italic' },
    { type: 'button', name: 'underline',     command: 'underline',     icon: 'underline',     labelKey: 'underline' },
    { type: 'button', name: 'strikethrough', command: 'strikethrough', icon: 'strikethrough', labelKey: 'strikethrough' },
    { type: 'button', name: 'superscript',  command: 'superscript',  icon: 'superscript',  labelKey: 'superscript' },
    { type: 'button', name: 'subscript',    command: 'subscript',    icon: 'subscript',    labelKey: 'subscript' },
    { type: 'button', name: 'inlineCode',    command: 'inlineCode',    icon: 'inlineCode',    labelKey: 'inlineCode' },
    { type: 'button', name: 'removeFormat',  command: 'removeFormat',  icon: 'removeFormat',  labelKey: 'removeFormat' },
    // 17.5.1 — change case (free; CKEditor premium / Jodit PRO charge for it)
    { type: 'dropdown', name: 'changeCase', kind: 'changeCase', labelKey: 'changeCase' },
    // 17.5.8 — rendered only when config.styles is non-empty (toolbar-manager skips it otherwise)
    { type: 'dropdown', name: 'styles', kind: 'styles', labelKey: 'styles' },
    // 17.5.10 — rendered only when config.textPartLanguages is non-empty
    { type: 'dropdown', name: 'textPartLanguage', kind: 'textPartLanguage', labelKey: 'textPartLanguage' },
  ],
  // block
  [
    { type: 'dropdown', name: 'heading',    kind: 'heading',    labelKey: 'heading' },
    { type: 'dropdown', name: 'fontFamily', kind: 'fontFamily', labelKey: 'fontFamily' },
    { type: 'dropdown', name: 'fontSize',   kind: 'fontSize',   labelKey: 'fontSize' },
    { type: 'dropdown', name: 'lineHeight', kind: 'lineHeight', labelKey: 'lineHeight' },
    { type: 'button',   name: 'blockquote', command: 'blockquote', icon: 'blockquote', labelKey: 'blockquote' },
  ],
  // color
  [
    { type: 'color', name: 'textColor', kind: 'textColor', icon: 'textColor', labelKey: 'textColor' },
    { type: 'color', name: 'bgColor',   kind: 'bgColor',   icon: 'bgColor',   labelKey: 'bgColor' },
  ],
  // lists + align
  [
    { type: 'listStyle', name: 'ul', command: 'ul', icon: 'ul', labelKey: 'ul', listTag: 'ul' },
    { type: 'listStyle', name: 'ol', command: 'ol', icon: 'ol', labelKey: 'ol', listTag: 'ol' },
    { type: 'button', name: 'outdent',      command: 'outdent',      icon: 'outdent',      labelKey: 'outdent' },
    { type: 'button', name: 'indent',       command: 'indent',       icon: 'indent',       labelKey: 'indent' },
    { type: 'alignment', name: 'alignment', labelKey: 'alignment' },
  ],
  // insert
  [
    { type: 'button', name: 'insertHorizontalRule', command: 'insertHorizontalRule', icon: 'hr', labelKey: 'insertHorizontalRule' },
    { type: 'button', name: 'insertPageBreak', command: 'insertPageBreak', icon: 'pageBreak', labelKey: 'insertPageBreak' },
  ],
  // history
  [
    { type: 'button', name: 'undo', command: 'undo', icon: 'undo', labelKey: 'undo' },
    { type: 'button', name: 'redo', command: 'redo', icon: 'redo', labelKey: 'redo' },
  ],
  // view
  [
    { type: 'button', name: 'fullscreen', icon: 'fullscreen', labelKey: 'fullscreen', action: 'fullscreen' },
    { type: 'button', name: 'print',      icon: 'print',      labelKey: 'print',      action: 'print' },
    { type: 'button', name: 'showBlocks', icon: 'showBlocks', labelKey: 'showBlocks', command: 'showBlocks' },
  ],
];

export const HEADING_OPTIONS = [
  { command: 'paragraph', labelKey: 'paragraph', tag: 'p' },
  { command: 'h1', labelKey: 'h1', tag: 'h1' },
  { command: 'h2', labelKey: 'h2', tag: 'h2' },
  { command: 'h3', labelKey: 'h3', tag: 'h3' },
  { command: 'h4', labelKey: 'h4', tag: 'h4' },
  { command: 'h5', labelKey: 'h5', tag: 'h5' },
  { command: 'h6', labelKey: 'h6', tag: 'h6' },
  { command: 'pre', labelKey: 'pre', tag: 'pre' },
];

export const UL_STYLE_OPTIONS = [
  { value: 'disc',   labelKey: 'listDisc' },
  { value: 'circle', labelKey: 'listCircle' },
  { value: 'square', labelKey: 'listSquare' },
];

export const OL_STYLE_OPTIONS = [
  { value: 'decimal',     labelKey: 'listDecimal' },
  { value: 'lower-alpha', labelKey: 'listLowerAlpha' },
  { value: 'lower-greek', labelKey: 'listLowerGreek' },
  { value: 'lower-roman', labelKey: 'listLowerRoman' },
  { value: 'upper-alpha', labelKey: 'listUpperAlpha' },
  { value: 'upper-roman', labelKey: 'listUpperRoman' },
];

export const DEFAULT_FONTS = [
  'Arial', 'Arial Black', 'Comic Sans MS', 'Courier New', 'Georgia',
  'Impact', 'Lucida Console', 'Lucida Sans Unicode', 'Palatino Linotype',
  'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana',
];
export const DEFAULT_FONT_SIZES = [
  '8px', '9px', '10px', '11px', '12px', '14px', '16px', '18px',
  '20px', '22px', '24px', '26px', '28px', '30px', '36px', '48px',
  '60px', '72px', '84px', '96px',
];
export const DEFAULT_LINE_HEIGHTS = ['1', '1.15', '1.5', '1.75', '2', '2.5', '3'];
export const ALIGNMENT_OPTIONS = [
  { command: 'alignLeft',    icon: 'alignLeft',    labelKey: 'alignLeft' },
  { command: 'alignCenter',  icon: 'alignCenter',  labelKey: 'alignCenter' },
  { command: 'alignRight',   icon: 'alignRight',   labelKey: 'alignRight' },
  { command: 'alignJustify', icon: 'alignJustify', labelKey: 'alignJustify' },
];

export const DEFAULT_SWATCHES = [
  // Row 1: grays
  '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#ffffff',
  // Row 2: reds/pinks
  '#ff0000', '#ff4444', '#ff9900', '#ffff00', '#ff00ff', '#cc0000', '#e06666', '#ea9999',
  // Row 3: greens
  '#00ff00', '#00cc00', '#008a00', '#006600', '#38761d', '#93c47d', '#b6d7a8', '#d9ead3',
  // Row 4: blues
  '#0000ff', '#0066cc', '#4a86e8', '#6fa8dc', '#9fc5e8', '#cfe2f3', '#1155cc', '#1c4587',
  // Row 5: purples/other
  '#9900ff', '#9933ff', '#b4a7d6', '#8e7cc3', '#674ea7', '#20124d', '#741b47', '#4c1130',
];
