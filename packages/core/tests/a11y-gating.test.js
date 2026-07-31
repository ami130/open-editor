/**
 * a11y-gating.test.js — Phase 2.7 proof.
 * The Alt+0 shortcut-help dialog reads the LIVE shortcut registry, so gated
 * shortcuts (Phase 2.3) never appear there. Confirms the a11y surface inherits
 * gating automatically.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';
import { collectShortcutRows } from '../src/ui/a11y-help-dialog.js';

let target;
function mount(config) {
  target = document.createElement('div');
  document.body.appendChild(target);
  return new OpenEditor(target, config);
}
let editor;
afterEach(() => { editor && editor.destroy && editor.destroy(); target && target.remove(); });

describe('Phase 2.7 — a11y help dialog inherits shortcut gating', () => {
  it('gated shortcuts do not appear in the help rows', () => {
    editor = mount({ grantedFeatures: ['text.bold'] });
    const labels = collectShortcutRows(editor, null).map((r) => r.label.toLowerCase());
    // bold granted → present; italic/underline gated → absent
    expect(labels.some((l) => l.includes('bold'))).toBe(true);
    expect(labels.some((l) => l.includes('italic'))).toBe(false);
    expect(labels.some((l) => l.includes('underline'))).toBe(false);
    // always-on undo still listed
    expect(labels.some((l) => l.includes('undo'))).toBe(true);
  });
});
