/**
 * toolbar-gating.test.js — Phase 2.1 proof.
 *
 * With a limited license, the main toolbar shows ONLY the granted features
 * (plus always-on chrome like undo/redo/removeFormat) and hides the rest.
 * With the default (no grantedFeatures) the toolbar is UNCHANGED (grant-all).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';

let target;
function mount(config) {
  target = document.createElement('div');
  document.body.appendChild(target);
  return new OpenEditor(target, config);
}
function toolbarButtonNames(editor) {
  // Each control stores its source item; collect the item names present.
  return (editor.toolbar && editor.toolbar._controls || [])
    .map((c) => c.item && c.item.name)
    .filter(Boolean);
}
let editor;
afterEach(() => { editor && editor.destroy && editor.destroy(); target && target.remove(); });

describe('Phase 2.1 — main toolbar gating', () => {
  it('default (no grantedFeatures) shows the full toolbar (grant-all, unchanged)', () => {
    editor = mount({});
    const names = toolbarButtonNames(editor);
    expect(names).toContain('bold');
    expect(names).toContain('italic');
    expect(names).toContain('textColor');
    expect(names).toContain('heading');
    expect(names).toContain('ul');
  });

  it('a limited license shows ONLY granted features + hides the rest', () => {
    editor = mount({ grantedFeatures: ['text.bold', 'list.bullet'] });
    const names = toolbarButtonNames(editor);
    // granted
    expect(names).toContain('bold');
    expect(names).toContain('ul');
    // NOT granted → hidden
    expect(names).not.toContain('italic');
    expect(names).not.toContain('underline');
    expect(names).not.toContain('textColor');
    expect(names).not.toContain('heading');
    expect(names).not.toContain('ol');
  });

  it('always-on chrome (undo/redo/removeFormat) stays visible even with an empty grant', () => {
    editor = mount({ grantedFeatures: [] });
    const names = toolbarButtonNames(editor);
    // These are ALWAYS_ON / unmapped chrome — never gated.
    expect(names).toContain('undo');
    expect(names).toContain('redo');
    expect(names).toContain('removeFormat');
    // but a normal feature is gone
    expect(names).not.toContain('bold');
  });

  it("'*' grants everything (same as default)", () => {
    editor = mount({ grantedFeatures: ['*'] });
    const names = toolbarButtonNames(editor);
    expect(names).toContain('bold');
    expect(names).toContain('heading');
    expect(names).toContain('textColor');
  });
});
