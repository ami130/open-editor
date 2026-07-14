export class Logger {
  constructor(debug = false, customLogger = null) {
    this._debug = debug;
    this._custom = customLogger;
  }

  _log(level, args) {
    // Errors are always surfaced — gating them behind debug would silently
    // swallow real failures in production. info/warn stay debug-gated.
    if (level !== 'error' && !this._debug) return;
    if (this._custom && typeof this._custom[level] === 'function') {
      // A throwing custom logger must not break editor internals.
      try {
        this._custom[level](...args);
      } catch {
        if (typeof console !== 'undefined' && console[level]) {
          console[level]('[OpenEditor]', ...args);
        }
      }
      return;
    }
    if (typeof console !== 'undefined' && typeof console[level] === 'function') {
      console[level]('[OpenEditor]', ...args);
    }
  }

  info(...args) {
    this._log('info', args);
  }

  warn(...args) {
    this._log('warn', args);
  }

  error(...args) {
    this._log('error', args);
  }

  // Always-surfaced developer notice (not debug-gated). For one-shot,
  // construction-time messages the developer must see — e.g. an unknown config
  // key — without turning on debug logging.
  notify(level, ...args) {
    const lvl = level === 'error' ? 'error' : 'warn';
    if (this._custom && typeof this._custom[lvl] === 'function') {
      try { this._custom[lvl](...args); return; } catch { /* fall through */ }
    }
    if (typeof console !== 'undefined' && typeof console[lvl] === 'function') {
      console[lvl]('[OpenEditor]', ...args);
    }
  }

  setDebug(enabled) {
    this._debug = enabled;
  }
}
