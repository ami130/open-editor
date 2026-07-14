/**
 * PluginManager (Phase 8) — install, uninstall, and lifecycle management for
 * all editor plugins. Stored as `editor.plugins`.
 *
 * Plugin interface contract:
 *   {
 *     name:               string           (required, unique)
 *     install(editor):    void             (required)
 *     destroy():          void             (required)
 *     dependencies?:      string[]         (optional — installed first)
 *     getToolbarButtons?(): descriptor[]   (optional — contributed to the toolbar)
 *     onKeyDown?(e): boolean               (optional — return true to intercept keydown)
 *   }
 *
 * Lifecycle hooks are EventEmitter subscriptions made inside install():
 *   editor.on('change', handler)   → onInit / onChange / onPaste / etc.
 * PluginManager tracks every listener registered during install() and removes
 * them automatically on uninstall() — plugins need not clean up manually.
 *
 * Error isolation: every call into plugin code is wrapped in try/catch.
 * One bad plugin emits editor 'error' and does NOT propagate.
 */
export class PluginManager {
  constructor(editor) {
    this._editor    = editor;
    this._registry  = new Map(); // name → plugin spec (registered, may not be installed)
    this._installed = new Map(); // name → plugin instance (installed)
    this._listeners = new Map(); // name → [{ event, fn }] tracked during install
    this._installing = new Set(); // circular-dependency guard
  }

  // ─── Registration ──────────────────────────────────────────────────────────

  /**
   * Register a plugin spec so it can be installed by name later, or resolved
   * as a dependency. Calling register() does NOT install the plugin.
   * Passing an already-registered name overwrites the spec with a warning.
   */
  register(spec) {
    if (!spec || typeof spec.name !== 'string' || !spec.name) {
      throw new Error('PluginManager.register: plugin spec must have a string "name".');
    }
    if (typeof spec.install !== 'function') {
      throw new Error(`PluginManager.register: plugin "${spec.name}" must implement install(editor).`);
    }
    if (typeof spec.destroy !== 'function') {
      throw new Error(`PluginManager.register: plugin "${spec.name}" must implement destroy().`);
    }
    if (this._registry.has(spec.name)) {
      this._editor.logger && this._editor.logger.warn(
        `PluginManager: plugin "${spec.name}" already registered — overwriting.`
      );
    }
    this._registry.set(spec.name, spec);
    return this;
  }

  // ─── Install ───────────────────────────────────────────────────────────────

  /**
   * Install a plugin. Accepts either:
   *   - a plugin spec object directly (auto-registers if not yet registered)
   *   - a registered plugin name string
   *
   * Resolves and installs declared `dependencies` first.
   * Emits 'pluginInstalled' on success.
   */
  install(specOrName) {
    const spec = this._resolve(specOrName);
    if (!spec) return this;

    // Already installed — idempotent, no double-install.
    if (this._installed.has(spec.name)) {
      this._editor.logger && this._editor.logger.warn(
        `PluginManager: plugin "${spec.name}" is already installed.`
      );
      return this;
    }

    // Circular dependency guard — checked before resolving deps so that
    // circ-a → circ-b → circ-a is caught when recursion comes back to circ-a.
    if (this._installing.has(spec.name)) {
      throw new Error(
        `PluginManager: circular dependency detected for plugin "${spec.name}".`
      );
    }

    this._installing.add(spec.name);
    try {
      // Resolve dependencies before calling install().
      if (Array.isArray(spec.dependencies)) {
        for (const depName of spec.dependencies) {
          if (this._installed.has(depName)) continue;
          if (!this._registry.has(depName)) {
            throw new Error(
              `PluginManager: plugin "${spec.name}" requires "${depName}" — ` +
              `register "${depName}" before installing "${spec.name}".`
            );
          }
          this.install(depName);
        }
      }

      // Wrap editor.on during install() to track every listener the plugin adds.
      const tracked = [];
      this._listeners.set(spec.name, tracked);
      const origOn = this._editor.on.bind(this._editor);
      const patchedOn = (event, fn) => { tracked.push({ event, fn }); return origOn(event, fn); };
      this._editor.on = patchedOn;

      try {
        spec.install(this._editor);
      } catch (err) {
        this._editor.logger && this._editor.logger.error(
          `PluginManager: error installing plugin "${spec.name}":`, err
        );
        this._editor.emit('error', { error: err, context: `plugin:install:${spec.name}` });
        // M9 fix: a plugin that added listeners before throwing would otherwise
        // leak them (untracked once we drop the map entry). Remove them first.
        for (const { event, fn } of tracked) {
          try { this._editor.off(event, fn); } catch { /* ignore */ }
        }
        this._listeners.delete(spec.name);
        // MEDIUM fix: PluginManager can only track editor.on() listeners — a
        // plugin that also bound window/DOM listeners or opened resources in
        // install() before throwing would leak them. Give the plugin its own
        // teardown by calling destroy() (guarded; it must tolerate a partial
        // install). We restore editor.on first (via finally) so destroy() sees
        // the real emitter, not the tracking wrapper.
        this._editor.on = origOn;
        try { if (typeof spec.destroy === 'function') spec.destroy(); }
        catch (derr) {
          this._editor.logger && this._editor.logger.error(
            `PluginManager: destroy() after failed install of "${spec.name}":`, derr
          );
        }
        return this;
      } finally {
        this._editor.on = origOn;
      }

      this._installed.set(spec.name, spec);

      // Contribute toolbar buttons if toolbar exists.
      if (typeof spec.getToolbarButtons === 'function' && this._editor.toolbar) {
        try {
          const buttons = spec.getToolbarButtons() || [];
          for (const btn of buttons) this._editor.toolbar.addButton(btn);
        } catch (err) {
          this._editor.logger && this._editor.logger.error(
            `PluginManager: getToolbarButtons() failed for "${spec.name}":`, err
          );
        }
      }

      this._editor.emit('pluginInstalled', { name: spec.name, plugin: spec });
      this._editor.logger && this._editor.logger.info(`plugin installed: ${spec.name}`);
    } finally {
      this._installing.delete(spec.name);
    }
    return this;
  }

  // ─── Uninstall ─────────────────────────────────────────────────────────────

  /**
   * Uninstall a plugin by name. Removes its toolbar buttons, removes all
   * tracked event listeners, then calls plugin.destroy(). Emits 'pluginUninstalled'.
   */
  uninstall(name) {
    const instance = this._installed.get(name);
    if (!instance) {
      this._editor.logger && this._editor.logger.warn(
        `PluginManager: plugin "${name}" is not installed.`
      );
      return this;
    }

    // Remove toolbar buttons this plugin contributed.
    if (typeof instance.getToolbarButtons === 'function' && this._editor.toolbar) {
      try {
        const buttons = instance.getToolbarButtons() || [];
        for (const btn of buttons) this._editor.toolbar.removeButton(btn.name);
      } catch { /* ignore toolbar errors on uninstall */ }
    }

    // Remove all event listeners tracked during install().
    const tracked = this._listeners.get(name) || [];
    for (const { event, fn } of tracked) {
      try { this._editor.off(event, fn); } catch { /* ignore */ }
    }
    this._listeners.delete(name);

    // Call the plugin's own destroy().
    try {
      instance.destroy();
    } catch (err) {
      this._editor.logger && this._editor.logger.error(
        `PluginManager: error in destroy() for plugin "${name}":`, err
      );
      this._editor.emit('error', { error: err, context: `plugin:destroy:${name}` });
    }

    this._installed.delete(name);
    this._editor.emit('pluginUninstalled', { name });
    this._editor.logger && this._editor.logger.info(`plugin uninstalled: ${name}`);
    return this;
  }

  // ─── Query ─────────────────────────────────────────────────────────────────

  /** Return the installed plugin instance by name, or undefined. */
  get(name) { return this._installed.get(name); }

  /** Return true if the named plugin is currently installed. */
  isInstalled(name) { return this._installed.has(name); }

  /** Return a read-only copy of all installed plugins as Map<name, instance>. */
  getAll() { return new Map(this._installed); }

  // ─── Destroy ───────────────────────────────────────────────────────────────

  /** Called by editor.destroy() — uninstalls all plugins in reverse order. */
  destroy() {
    const names = Array.from(this._installed.keys()).reverse();
    for (const name of names) this.uninstall(name);
    this._registry.clear();
    this._listeners.clear();
    this._installing.clear();
    this._editor = null;
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  _resolve(specOrName) {
    if (typeof specOrName === 'string') {
      const spec = this._registry.get(specOrName);
      if (!spec) {
        throw new Error(
          `PluginManager: plugin "${specOrName}" is not registered. ` +
          `Call register(spec) before install("${specOrName}").`
        );
      }
      return spec;
    }
    if (specOrName && typeof specOrName === 'object') {
      // Auto-register if not already registered.
      if (!this._registry.has(specOrName.name)) this.register(specOrName);
      return this._registry.get(specOrName.name);
    }
    throw new Error('PluginManager.install: argument must be a plugin spec or registered name string.');
  }
}
