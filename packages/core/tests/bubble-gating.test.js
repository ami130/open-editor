/**
 * bubble-gating.test.js — Phase 2.4 proof.
 * The inline/bubble toolbar has its OWN item list; gate it too.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';

let target;
function mount(config) {
  target = document.createElement('div');
  document.body.appendChild(target);
  return new OpenEditor(target, { inlineToolbar: true, ...config });
}
function bubbleCommands(editor) {
  return (editor.inlineToolbar && editor.inlineToolbar._controls || [])
    .map((c) => c.item && c.item.command).filter(Boolean);
}
let editor;
afterEach(() => { editor && editor.destroy && editor.destroy(); target && target.remove(); });

describe('Phase 2.4 — bubble toolbar gating', () => {
  it('default shows bold + italic in the bubble', () => {
    editor = mount({});
    const cmds = bubbleCommands(editor);
    expect(cmds).toContain('bold');
    expect(cmds).toContain('italic');
  });

  it('a limited license hides un-granted bubble buttons', () => {
    editor = mount({ grantedFeatures: ['text.bold'] });
    const cmds = bubbleCommands(editor);
    expect(cmds).toContain('bold');
    expect(cmds).not.toContain('italic');
    expect(cmds).not.toContain('underline');
    expect(cmds).not.toContain('blockquote');
  });
});
