/**
 * shortcut-gating.test.js — Phase 2.3 proof.
 *
 * An un-granted feature's keyboard shortcut is NOT registered, so the key isn't
 * captured then no-op'd (Cmd+B wouldn't "eat" the keystroke). Always-on
 * shortcuts (undo/redo/selectAll) always register.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';

let target;
function mount(config) {
  target = document.createElement('div');
  document.body.appendChild(target);
  return new OpenEditor(target, config);
}
function shortcutCommands(editor) {
  // shortcut-manager exposes a Map copy of {keys → {command}}.
  const all = editor.shortcuts.getAll ? editor.shortcuts.getAll() : new Map();
  return [...all.values()].map((s) => s.command);
}
let editor;
afterEach(() => { editor && editor.destroy && editor.destroy(); target && target.remove(); });

describe('Phase 2.3 — keyboard shortcut gating', () => {
  it('default registers bold + italic shortcuts', () => {
    editor = mount({});
    const cmds = shortcutCommands(editor);
    expect(cmds).toContain('bold');
    expect(cmds).toContain('italic');
  });

  it('a limited license does NOT register un-granted shortcuts', () => {
    editor = mount({ grantedFeatures: ['text.bold'] });
    const cmds = shortcutCommands(editor);
    expect(cmds).toContain('bold');       // granted → shortcut present
    expect(cmds).not.toContain('italic'); // not granted → shortcut absent
    expect(cmds).not.toContain('underline');
  });

  it('always-on shortcuts (undo/redo/selectAll) register even with empty grant', () => {
    editor = mount({ grantedFeatures: [] });
    const cmds = shortcutCommands(editor);
    expect(cmds).toContain('undo');
    expect(cmds).toContain('redo');
    expect(cmds).toContain('selectAll');
    expect(cmds).not.toContain('bold');
  });
});
