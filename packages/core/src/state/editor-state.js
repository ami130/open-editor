/**
 * EditorState — the editor's observable state container (Phase 2).
 *
 * Holds content/flags/metadata plus live word & character counts. Mutating
 * metadata through setMeta() notifies the owning editor so it can emit a
 * `stateChange` event; the editor wires that up via setNotify().
 */
export class EditorState {
  constructor() {
    this.html = '';
    this.isFocused = false;
    this.isReadOnly = false;
    this.isDirty = false;
    this.metadata = Object.create(null);
    // Live counts (2.6) — refreshed by the editor's MutationObserver.
    this.wordCount = 0;
    this.charCount = 0;
    // Notify callback (key, value) → void, installed by the editor.
    this._notify = null;
  }

  // Editor installs this so metadata writes can surface a `stateChange` event
  // without EditorState needing a hard reference to the EventEmitter.
  setNotify(fn) {
    this._notify = typeof fn === 'function' ? fn : null;
  }

  // ─── Metadata (2.5) ──────────────────────────────────────────────────────────

  setMeta(key, value) {
    if (typeof key !== 'string' || !key) return this;
    this.metadata[key] = value;
    if (this._notify) this._notify(key, value);
    return this;
  }

  getMeta(key) {
    return this.metadata[key];
  }

  // ─── Serialization (2.7) ───────────────────────────────────────────────────────
  // JSON round-trip of content + metadata. Counts/flags are derived state and
  // are intentionally NOT serialized (they are recomputed from content on load).

  serialize() {
    return JSON.stringify({
      version: '1.0',
      html: this.html,
      metadata: { ...this.metadata },
    });
  }

  deserialize(snapshot) {
    let data = snapshot;
    if (typeof snapshot === 'string') {
      try { data = JSON.parse(snapshot); } catch { return this; }
    }
    if (!data || typeof data !== 'object') return this;
    if (typeof data.html === 'string') this.html = data.html;
    if (data.metadata && typeof data.metadata === 'object') {
      this.metadata = Object.assign(Object.create(null), data.metadata);
    }
    return this;
  }
}
