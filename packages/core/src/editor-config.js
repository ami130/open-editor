/**
 * Editor configuration defaults and the safe deep-merge used to combine them
 * with user config. Extracted from editor.js to keep that file under the
 * project's 300-line limit.
 */

export const DEFAULTS = {
  debug: false,
  logger: null,
  toolbar: true,
  statusBar: true,
  readonly: false,
  spellcheck: false,
  autofocus: false,
  iframe: false,
  direction: 'ltr',            // 14.11 — 'ltr' | 'rtl'; sets dir on the editable + wrapper
  theme: 'light',              // 15.x — 'light' | 'dark' | 'minimal' | 'auto'
  minHeight: 200,
  maxHeight: null,
  height: null,
  defaultContent: '',
  placeholder: 'Start typing…',
  sanitize: true,
  allowTags: null,
  allowAttributes: null,
  imageAllowDataUri: false,
  imageDefaultWidth: null,      // px width applied to inserted images that carry no size
  imageAvailableClasses: null,  // [{value,label}] → class dropdown in Image Properties
  imageOpenOnDblClick: true,    // double-click an image opens the properties dialog
  tableAvailableClasses: null,  // [{value,label}] → style preset selector on table insert
  tableDefaultClass: null,      // class applied to inserted tables when no preset chosen
  tableDefaultHeaderRow: false, // make the first row a header on insert
  denyTags: null,
  // Phase 12 — paste engine
  askBeforePasteHTML: true,        // prompt Keep/Text/Only on rich HTML paste
  askBeforePasteFromWord: true,    // prompt on Word/Excel paste
  defaultActionOnPaste: 'keep',    // action when not prompting: 'keep'|'text'|'only'
  defaultActionOnPasteFromWord: null, // Word default (null → defaultActionOnPaste)
  pasteStripStyles: true,          // drop leftover inline styles after promotion
  // Phase 13 — content plugins
  specialCharacters: null,         // [{ch,label}] or ['×','÷',…] → Special Chars grid (null = built-in set)
  emojis: null,                    // [{ch,label,cat,keywords}] → Emoji grid (null = built-in set)
  formatPainterSticky: false,      // true → format painter stays armed until toggled off
  codeBlockLanguages: null,        // [{value,label}] for the code-block language selector (null = built-in)
  sourceModeBeautify: true,        // pretty-print HTML when entering source view
  sourceModeHighlight: true,       // 16.7.7 — syntax-highlight the source-view textarea (overlay)
  maxLength: null,
  autosave: null,
  // onChange: a function `({html,text})=>{}`, OR `{ handler, debounce }`, OR
  // `{ debounce }` for event-only. The debounced content-change also emits the
  // 'onChange' event regardless of this option.
  onChange: null,
  locale: 'en',
  inlineToolbar: false,
  blockquoteToolbar: true,
  // 16.5.3 — when true, warn (native browser prompt) before the tab closes if
  // there are unsaved changes (isDirty). Off by default — opt-in only.
  warnOnUnload: false,
  // 16.6.2 — typing shortcuts auto-convert as you type (**bold**, # heading,
  // - list, > quote, etc. — see markdown-autoformat.js). On by default; set
  // false to disable entirely.
  autoformat: true,
  // 16.6.3 — { source: (query) => Promise<[{id,label}]> } data provider for the
  // @mentions plugin. null (default) means the mentions plugin, if installed,
  // has no data source and the popup stays empty.
  mentions: null,
  // 17.0c — POST endpoint for image uploads (multipart `file` field). null
  // (default) = no upload server: dropped/pasted local files become data: URIs,
  // which are blocked unless imageAllowDataUri is true. The key was always read
  // by the image plugin but missing here, so setting it triggered a FALSE
  // "unknown config option — ignored" warning. Response contract: JSON
  // { url } (or { src }); optionally { sources: [{srcset, media?, type?, sizes?}] }
  // to emit a responsive <picture> (16.7.8) — every srcset is scheme-checked.
  imageUploadUrl: null,
};

const BANNED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Deep-merge `source` into `target`, skipping prototype-pollution keys and
 * cloning nested plain objects so shared DEFAULTS sub-objects aren't mutated.
 */
export function safeMerge(target, source) {
  if (!source || typeof source !== 'object') return target;
  for (const key of Object.keys(source)) {
    if (BANNED_KEYS.has(key)) continue;
    const val = source[key];
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      if (!target[key] || typeof target[key] !== 'object') target[key] = {};
      safeMerge(target[key], val);
    } else {
      target[key] = val;
    }
  }
  return target;
}

// 16.C — warn (never throw) on top-level config keys the editor does not know.
// Catches typos like `readOnly`/`spellCheck` that were previously swallowed
// silently. Only the top level is checked — nested shapes (autosave.*, onChange.*)
// are intentionally open. Suggests the closest known key when one is near.
export function warnUnknownConfigKeys(userConfig, logger) {
  if (!userConfig || typeof userConfig !== 'object' || !logger) return;
  const known = Object.keys(DEFAULTS);
  for (const key of Object.keys(userConfig)) {
    if (BANNED_KEYS.has(key) || known.includes(key)) continue;
    const near = known.find((k) => k.toLowerCase() === key.toLowerCase());
    const msg = `unknown config option "${key}" — ignored.` +
      (near ? ` Did you mean "${near}"?` : '');
    // Always surface (not debug-gated) — a config typo silently breaks setup.
    if (typeof logger.notify === 'function') logger.notify('warn', msg);
    else logger.warn(msg);
  }
}
