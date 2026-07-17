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
  imageMaxFileSize: 10 * 1024 * 1024, // bytes; single source of truth for the file-size guard (default 10 MB)
  imageUploadResponse: null,    // (json) => url|{url,sources?} — map a custom upload-server response shape
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
  // 19.7 — FREE BYO-endpoint AI hook (the funnel for the premium AI product).
  // aiEndpoint: a URL this editor POSTs { prompt, system, stream, ...} to and
  // streams tokens back from (see ai/ai-complete.js for the response contract).
  // aiHeaders: extra request headers (e.g. an Authorization value if you
  // knowingly expose a key client-side; prefer a server proxy). Both null =
  // the AI hook is inert; editor.aiComplete() no-ops until aiEndpoint is set.
  aiEndpoint: null,
  aiHeaders: null,
  // 17.5.2 — typing autocorrect: (c)/(r)/(tm) symbols, 1/2-style fractions,
  // -- / --- dashes, and smart quotes. true = all on (default), false = all
  // off, or per-group: { symbols, fractions, dashes, smartQuotes }.
  textTransformations: true,
  // 17.5.8 — named style presets for the toolbar Styles dropdown:
  // [{ label, element?, classes: [] }]. element = block tag applies the block
  // + classes; absent/'span' wraps the selection in a classed <span>. null =
  // no dropdown rendered.
  styles: null,
  // 17.5.10 — language list for the text-part-language dropdown:
  // [{ code: 'ar', label: 'العربية' }]. RTL codes get dir="rtl" automatically.
  // null = no dropdown rendered.
  textPartLanguages: null,
  // Bookmark presentation (advanced edition). Icons AND colors default to the
  // built-in sets (pass null/false to disable a picker, or supply your own
  // [{ value, label, css? }]). Keys are validated against SAFE_KEY_RE before
  // ever being written to the DOM.
  bookmarkIcons: undefined,        // undefined → built-in icon set; null/false → no icon picker
  bookmarkColors: undefined,       // undefined/true → built-in palette; null/false → no color picker
  bookmarkDefaultIcon: undefined,  // defaults to first icon ('flag')
  bookmarkDefaultColor: undefined, // defaults to none
  bookmarkIconSize: undefined,     // number (px) or CSS length ('1.4em'); default 1em = tracks text size
  bookmarkPanel: false,            // true → adds the jump-to-bookmark navigator toolbar button
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
