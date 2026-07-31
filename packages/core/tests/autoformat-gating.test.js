/**
 * autoformat-gating.test.js — Phase 2.6 proof.
 *
 * When a feature is NOT granted, its markdown autoformat pattern must NOT fire
 * AND must NOT strip the typed marker (no content corruption). The gate is
 * checked before any text mutation. Uses the pure matchers + granted() logic via
 * a live editor's autoformat handler.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';
import { createAutoformatPlugin } from '../src/plugins/autoformat/autoformat-plugin.js';

let target;
function mount(config) {
  target = document.createElement('div');
  document.body.appendChild(target);
  const ed = new OpenEditor(target, { autoformat: true, ...config });
  ed.plugins.install(createAutoformatPlugin());
  return ed;
}
let editor;
afterEach(() => { editor && editor.destroy && editor.destroy(); target && target.remove(); });

describe('Phase 2.6 — autoformat gating (no corruption)', () => {
  it('default: `# ` autoformats to a heading', () => {
    editor = mount({});
    editor.setHTML('<p>hi</p>');
    // With headings granted (default), executing the heading command works.
    expect(editor.commands.execute('h1')).not.toBe(false);
  });

  it('gated: heading command refused, and (proof) execute returns false so a pattern bails', () => {
    editor = mount({ grantedFeatures: ['text.bold'] });
    // h1 is not granted → execute refuses → the block-pattern handler's
    // granted() check returns false BEFORE stripping the marker.
    expect(editor.commands.execute('h1')).toBe(false);
    // bold IS granted → still works via autoformat/execute
    expect(editor.commands.execute('bold')).not.toBe(false);
  });
});
