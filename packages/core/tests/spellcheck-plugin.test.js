/**
 * spellcheck-plugin.test.js — Phase 13.10: native spellcheck toggle.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';
import { createSpellcheckPlugin, spellcheckPlugin } from '../src/plugins/spellcheck/spellcheck-plugin.js';

let editor;
beforeEach(() => { editor = createTestEditor(); });
afterEach(() => {
  if (!editor.isDestroyed()) editor.destroy();
  if (editor._target && editor._target.parentNode) editor._target.remove();
});

const btn = (p) => p.getToolbarButtons()[0];

describe('createSpellcheckPlugin', () => {
  it('exposes the plugin contract', () => {
    const p = createSpellcheckPlugin();
    expect(p.name).toBe('spellcheck');
    expect(typeof p.install).toBe('function');
    expect(typeof p.destroy).toBe('function');
    expect(typeof p.getToolbarButtons).toBe('function');
  });

  it('exports a shared singleton', () => {
    expect(spellcheckPlugin.name).toBe('spellcheck');
  });

  it('contributes one toggle button with an isActive predicate', () => {
    const p = createSpellcheckPlugin();
    const b = btn(p);
    expect(b.name).toBe('spellcheck');
    expect(b.type).toBe('button');
    expect(typeof b.onClick).toBe('function');
    expect(typeof b.isActive).toBe('function');
  });
});

describe('spellcheck toggle behavior', () => {
  it('starts inactive when config default is false', () => {
    const p = createSpellcheckPlugin();
    p.install(editor);
    expect(editor.getEditorElement().getAttribute('spellcheck')).toBe('false');
    expect(btn(p).isActive(editor)).toBe(false);
  });

  it('clicking toggles the DOM attribute on then off', () => {
    const p = createSpellcheckPlugin();
    p.install(editor);
    const b = btn(p);

    b.onClick();
    expect(editor.getEditorElement().getAttribute('spellcheck')).toBe('true');
    expect(b.isActive(editor)).toBe(true);

    b.onClick();
    expect(editor.getEditorElement().getAttribute('spellcheck')).toBe('false');
    expect(b.isActive(editor)).toBe(false);
  });

  it('keeps config.spellcheck in sync with the toggle', () => {
    const p = createSpellcheckPlugin();
    p.install(editor);
    btn(p).onClick();
    expect(editor._config.spellcheck).toBe(true);
    btn(p).onClick();
    expect(editor._config.spellcheck).toBe(false);
  });

  it('emits afterCommand with the new state', () => {
    const p = createSpellcheckPlugin();
    p.install(editor);
    let seen = null;
    editor.on('afterCommand', (e) => { if (e.command === 'spellcheck') seen = e.args[0]; });
    btn(p).onClick();
    expect(seen).toBe(true);
  });

  it('isActive reads the live DOM attribute (never drifts)', () => {
    const p = createSpellcheckPlugin();
    p.install(editor);
    // externally flip the attribute → isActive must reflect it
    editor.getEditorElement().setAttribute('spellcheck', 'true');
    expect(btn(p).isActive(editor)).toBe(true);
  });
});

describe('install/destroy via PluginManager', () => {
  it('installs and contributes its button, then uninstalls cleanly', () => {
    const p = createSpellcheckPlugin();
    editor.plugins.install(p);
    expect(editor.plugins._installed.has('spellcheck')).toBe(true);
    expect(() => editor.plugins.uninstall('spellcheck')).not.toThrow();
    expect(editor.plugins._installed.has('spellcheck')).toBe(false);
  });
});
