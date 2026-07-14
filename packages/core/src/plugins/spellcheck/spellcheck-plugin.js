/**
 * spellcheck-plugin.js — Phase 13.10: toggle the browser's native spellcheck.
 *
 * The editable element carries a `spellcheck` attribute set from config at
 * setup (Phase 1, default false). This plugin adds a toolbar toggle that flips
 * that attribute live and reflects the current state via isActive. It uses the
 * browser's own spellchecker — there is NO custom dictionary engine (that would
 * be a model-level feature, deliberately out of scope).
 *
 * Implements the Phase 8 plugin interface: { name, install, destroy,
 * getToolbarButtons }. Stateless beyond the editor reference — the source of
 * truth is the DOM attribute, so isActive can never drift from reality.
 *
 * Usage:
 *   import { spellcheckPlugin } from './plugins/spellcheck/spellcheck-plugin.js';
 *   editor.plugins.install(spellcheckPlugin);
 */

const SPELLCHECK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="m6 16 6-12 6 12"/>
  <path d="M8 12h8"/>
  <path d="m16 20 2 2 4-4"/>
</svg>`;

/** Read the live spellcheck state from the editable element. */
function isSpellcheckOn(editor) {
  const el = editor && editor.getEditorElement && editor.getEditorElement();
  return !!el && el.getAttribute('spellcheck') === 'true';
}

export function createSpellcheckPlugin() {
  return {
    name: 'spellcheck',
    _editor: null,

    install(editor) {
      this._editor = editor;
    },

    destroy() {
      this._editor = null;
    },

    getToolbarButtons() {
      return [{
        name:    'spellcheck',
        type:    'button',
        icon:    SPELLCHECK_ICON,
        tooltip: 'Spellcheck',
        onClick: () => this._toggle(),
        // Live from the DOM attribute — always truthful, never drifts.
        isActive: (ed) => isSpellcheckOn(ed),
      }];
    },

    _toggle() {
      const editor = this._editor;
      const el = editor && editor.getEditorElement && editor.getEditorElement();
      if (!el) return;
      const next = !isSpellcheckOn(editor);
      el.setAttribute('spellcheck', String(next));
      // Keep config in sync so a later re-apply (setup/reset) preserves the choice.
      if (editor._config) editor._config.spellcheck = next;
      editor.emit('afterCommand', { command: 'spellcheck', args: [next] });
    },
  };
}

export const spellcheckPlugin = createSpellcheckPlugin();
