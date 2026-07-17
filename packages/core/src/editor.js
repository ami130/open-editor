import { EventEmitter } from './events/event-emitter.js';
import { Logger } from './logger/logger.js';
import { ShortcutManager } from './shortcuts/shortcut-manager.js';
import { EditorState } from './state/editor-state.js';
import { sanitize } from './sanitizer/sanitizer.js';
import { SelectionManager } from './selection/selection-manager.js';
import { HistoryManager } from './history/history-manager.js';
import { setupCommands } from './commands/setup-commands.js';
import { ensureEditorFloor } from './editing/block-editing.js';
import { PluginManager }    from './plugins/plugin-manager.js';
import { editorEventsMixin } from './editor-events.js';
import { editorPasteMixin } from './editor-paste.js';
import { editorDomMixin } from './editor-dom.js';
import { editorLifecycleMixin } from './editor-lifecycle.js';
import { editorMaxLengthMixin } from './editor-maxlength.js';
import { editorApiMixin } from './editor-api.js';
import { editorJsonMixin } from './editor-json.js';
import { markdownMixin } from './markdown/markdown-export.js';
import { aiMixin } from './ai/ai-complete.js';
import { editorViewMixin } from './editor-view.js';
import { editorMobileMixin } from './editor-mobile.js';
import { BASE_CSS } from './utils/base-css.js';
import { A11Y_CHROME_CSS } from './utils/a11y-css.js';
import { injectStyleOnce } from './utils/inject-style.js';
import { THEME_TOKENS_CSS } from './utils/theme-css.js';
import { ModalManager } from './ui/modal-manager.js';
import { TooltipManager } from './ui/tooltip-manager.js';
import { ContextMenuManager } from './ui/context-menu-manager.js';
import { ToolbarManager } from './ui/toolbar/toolbar-manager.js';
import { StatusBar } from './ui/toolbar/status-bar.js';
import { installTypeAround } from './editing/type-around.js';
import { InlineToolbar } from './ui/toolbar/inline-toolbar.js';
import { BlockquoteToolbar } from './ui/toolbar/blockquote-toolbar.js';
import { CommandAnnouncer } from './ui/command-announcer.js';
import { resolveLocale } from './ui/toolbar/locale.js';
import { DEFAULTS, safeMerge, warnUnknownConfigKeys } from './editor-config.js';

// Module-level counter — controls global <style> tag lifecycle
let _instanceCount = 0;

// ─── OpenEditor ───────────────────────────────────────────────────────────────

export class OpenEditor extends EventEmitter {
  constructor(target, userConfig = {}) {
    super();

    this._config = safeMerge(Object.assign({}, DEFAULTS), userConfig);

    // height shorthand — only fills in min/maxHeight the caller did NOT set
    // explicitly, so `{ height: 300, maxHeight: 600 }` keeps maxHeight: 600.
    if (this._config.height !== null) {
      if (userConfig.minHeight == null) this._config.minHeight = this._config.height;
      if (userConfig.maxHeight == null) this._config.maxHeight = this._config.height;
    }

    this._destroyed = false;
    this._isComposing = false;
    this._isSettingHTML = false;

    this.logger = new Logger(this._config.debug, this._config.logger);
    // 16.C — warn on unknown/misspelled top-level config keys (never throws).
    warnUnknownConfigKeys(userConfig, this.logger);
    this.shortcuts = new ShortcutManager(this.logger);

    // 2.1 — EditorState
    this._state = new EditorState();
    this._state.isReadOnly = !!this._config.readonly;
    // 2.8 — surface metadata writes as a `stateChange` event.
    // 1.10 — and log them when debug is on (state changes, not just events).
    this._state.setNotify((key, value) => {
      this.logger && this.logger.info('stateChange:', key, value);
      this.emit('stateChange', { key, value, state: this._state });
    });

    // Resolve container
    this._container = typeof target === 'string'
      ? document.querySelector(target)
      : target;

    if (!this._container) {
      throw new Error(`OpenEditor: target "${target}" not found in document.`);
    }

    this._styleEl = null;
    this._wrapper = null;
    this._editorEl = null;
    this._iframeEl = null;
    this._iframeDoc = null;
    this._mutationObserver = null;
    this._boundHandlers = {};
    this._timers = new Set();
    this._onChangeFn = null;
    this._autosaveIntervalId = null;
    this._lastAutosavedHTML = null;
    this.selection = null;
    this.commands  = null;
    this.history   = null;
    this.ui        = null;
    this.plugins   = null;
    this._init();
  }

  // Public read accessor for the editor's state container (2.1). Exposes
  // setMeta/getMeta/serialize/deserialize and live wordCount/charCount.
  get state() { return this._state; }

  // ─── Init ──────────────────────────────────────────────────────────────────

  _init() {
    this.logger.info('init start');
    this.emit('beforeInit', this);
    // M-19: if _init() throws after _injectGlobalStyles() incremented the
    // counter, we must decrement so the style tag is removed when the last
    // healthy instance destroys itself.  Wrap the whole body in try/finally.
    let stylesInjected = false;
    try {
    this._injectGlobalStyles();
    stylesInjected = true;
    this._buildDOM();
    this.selection = new SelectionManager(this._editorEl, this._iframeDoc);
    this._setupCommands();
    this._applyConfig();
    // Apply initial readonly through disable() so a {readonly:true} editor gets
    // the SAME aria-disabled + oe-disabled treatment as setReadOnly(true) — the
    // two entry points must not diverge (F4).
    if (this._config.readonly) this.disable();
    this._attachEvents();
    this._setupMutationObserver();
    this._setupOnChange();
    this._setupAutosave();

    if (this._config.defaultContent) {
      // Route through setHTML so sanitizer runs on defaultContent too
      this._isSettingHTML = true;
      this._setRawHTML(
        this._config.sanitize !== false
          ? this._sanitizeHTML(this._config.defaultContent)
          : this._config.defaultContent
      );
      // Enforce maxLength on defaultContent too (consistent with setHTML).
      if (this._config.maxLength != null && typeof this._truncateToMaxLength === 'function') {
        this._truncateToMaxLength();
      }
      this._isSettingHTML = false;
    }

    this._ensureParagraphMode();
    ensureEditorFloor(this);
    this._updatePlaceholder();

    // Phase 5 — History: wire up after DOM is stable, take initial snapshot
    this.history = new HistoryManager(this);
    this.history.takeSnapshot();

    // Phase 6 — Shared UI system (modal, tooltip, context menu)
    // Always scoped to the outer document wrapper, even in iframe mode.
    const uiDoc = typeof document !== 'undefined' ? document : null;
    this.ui = {
      modal:       new ModalManager(this._wrapper, uiDoc),
      tooltip:     new TooltipManager(this._wrapper, uiDoc),
      contextMenu: new ContextMenuManager(this._wrapper, uiDoc, this),
    };

    this._buildChrome();
    this.plugins = new PluginManager(this);

    if (this._config.autofocus) {
      this._editorEl.focus();
    }

    this.emit('init', this);
    this.emit('afterInit', this);
    this.emit('ready', this);

    this.logger.info('init complete');
    } catch (err) {
      // M-19: init failed after style tag was injected — undo the count increment
      // so the style tag is removed when the last healthy instance is destroyed.
      if (stylesInjected) this._removeGlobalStyles();
      throw err;
    }
  }

  // Phase 7 — build toolbar / status bar / inline bubble toolbar (chrome).
  _buildChrome() {
    this.toolbar = null;
    this.statusBar = null;
    this.inlineToolbar     = null;
    this.blockquoteToolbar = null;
    if (typeof document === 'undefined') return;
    const locale = resolveLocale(this._config.locale);
    if (this._config.toolbar !== false) {
      const opts = (this._config.toolbar && typeof this._config.toolbar === 'object') ? this._config.toolbar : {};
      this.toolbar = new ToolbarManager(this, opts);
    }
    if (this._config.statusBar !== false) this.statusBar = new StatusBar(this, locale, document);
    if (this._config.inlineToolbar) this.inlineToolbar = new InlineToolbar(this, locale, document);
    if (this._config.blockquoteToolbar !== false) this.blockquoteToolbar = new BlockquoteToolbar(this, document);
    // 14.2 — command-state live region (announces Bold on/off etc. to SRs).
    this.commandAnnouncer = new CommandAnnouncer(this);
    // 17.5.9 — hover escape-hatch around island blocks (table-at-start trap).
    this._destroyTypeAround = installTypeAround(this);
  }

  _injectGlobalStyles() {
    if (typeof document === 'undefined') return;
    // Phase 15 — theme tokens FIRST, so every chrome stylesheet that references
    // var(--oe-*) resolves against defined values. Injected into the host doc
    // (where chrome renders); the iframe editable gets them via BASE_CSS.
    injectStyleOnce(document, 'oe-theme-tokens', THEME_TOKENS_CSS);
    // F1 fix: chrome a11y rules (forced-colors / reduced-motion) must live in the
    // HOST document, where the toolbar/menus/modals render — even in iframe mode,
    // where BASE_CSS goes into the iframe (only the editable lives there). Inject
    // once, unconditionally, before the iframe early-return below. injectStyleOnce
    // uses constructable stylesheets under CSP (15.9), <style> as fallback.
    injectStyleOnce(document, 'oe-a11y-styles', A11Y_CHROME_CSS);
    // Count ONLY instances that actually own the shared global stylesheet.
    // iframe instances inject BASE_CSS into their own document and SSR instances
    // inject nothing, so they must not move this counter.
    if (this._config.iframe) return;
    _instanceCount++;
    injectStyleOnce(document, 'oe-base-styles', BASE_CSS);
    // _styleEl is only meaningful for the <style>-element fallback path, where the
    // refcount teardown removes it when the last editor is destroyed. Under the
    // constructable path there is no removable element (it stays null) and the
    // adopted sheet is harmlessly deduped/persisted — teardown safely no-ops.
    this._styleEl = document.getElementById('oe-base-styles');
  }

  // _buildDOM / _buildIframeDOM / _applyConfig live in editor-dom.js (300-line limit).

  // ─── Command setup (Phase 4) ───────────────────────────────────────────────

  _setupCommands() {
    setupCommands(this);
  }

  // ─── Internal DOM/state helpers ───────────────────────────────────────────

  _setRawHTML(html) {
    if (this._editorEl) {
      this._editorEl.innerHTML = html;
      this._updatePlaceholder();
    }
  }

  _updatePlaceholder() {
    // CSS :empty is unreliable: after the user clears content, contentEditable
    // typically leaves a <br> or empty block so :empty no longer matches and
    // the placeholder never reappears. Drive it from the editor's own isEmpty()
    // by toggling an 'oe-empty' class instead.
    const el = this._editorEl;
    if (!el) return;
    if (typeof this.isEmpty === 'function') {
      el.classList.toggle('oe-empty', this.isEmpty());
    }
  }

  _sanitizeHTML(html) {
    const doc = this._iframeDoc || (typeof document !== 'undefined' ? document : null);
    return sanitize(html, {
      allowTags:       this._config.allowTags       || undefined,
      allowAttributes: this._config.allowAttributes || undefined,
      denyTags:        this._config.denyTags        || undefined,
      allowDataUris:   !!this._config.imageAllowDataUri,
      document:        doc,
    });
  }

  // Accesses module-level _instanceCount — must stay in this file.
  _removeGlobalStyles() {
    // Mirror _injectGlobalStyles: only non-iframe instances ever incremented
    // the counter, so only they decrement it.
    if (this._config && this._config.iframe) return;
    if (typeof document === 'undefined') return;
    _instanceCount--;
    if (_instanceCount <= 0 && this._styleEl && this._styleEl.parentNode) {
      this._styleEl.parentNode.removeChild(this._styleEl);
      _instanceCount = 0;
    }
  }
}

Object.assign(OpenEditor.prototype, editorEventsMixin);
Object.assign(OpenEditor.prototype, editorPasteMixin);
Object.assign(OpenEditor.prototype, editorDomMixin);
Object.assign(OpenEditor.prototype, markdownMixin); // 17.5.12 — getMarkdown()
Object.assign(OpenEditor.prototype, aiMixin); // 19.7 — editor.aiComplete() (free BYO-endpoint hook)
Object.assign(OpenEditor.prototype, editorLifecycleMixin);
Object.assign(OpenEditor.prototype, editorMaxLengthMixin);
Object.assign(OpenEditor.prototype, editorApiMixin);
Object.assign(OpenEditor.prototype, editorJsonMixin);
Object.assign(OpenEditor.prototype, editorViewMixin);
Object.assign(OpenEditor.prototype, editorMobileMixin);
