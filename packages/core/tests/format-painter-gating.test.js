/**
 * format-painter-gating.test.js — Phase 2 leak-fix regression (HIGH leak #2).
 *
 * applyFormat() wraps tags via direct DOM (not commands.execute), so it must
 * gate per-tag. Before the fix, a license granting tools.formatPainter but
 * withholding e.g. text.bold could still paint bold.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';
import { applyFormat } from '../src/plugins/format-painter/format-capture.js';

let target;
function mount(config) {
  target = document.createElement('div');
  document.body.appendChild(target);
  return new OpenEditor(target, config);
}
function selectAllText(ed) {
  ed.focus();
  const p = ed.getEditorElement().querySelector('p') || ed.getEditorElement();
  const r = document.createRange(); r.selectNodeContents(p);
  const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
}
let editor;
afterEach(() => { editor && editor.destroy && editor.destroy(); target && target.remove(); });

// A "captured" format carrying bold + italic.
const boldItalic = { tags: ['strong', 'em'] };

describe('Phase 2 leak-fix — format-painter gating', () => {
  it('paints ONLY granted formats (bold granted, italic withheld)', () => {
    editor = mount({ grantedFeatures: ['text.bold', 'tools.formatPainter'] });
    editor.setHTML('<p>hello</p>');
    selectAllText(editor);
    applyFormat(editor, boldItalic);
    const html = editor.getHTML();
    expect(html).toContain('<strong>');   // bold granted → painted
    expect(html).not.toContain('<em>');    // italic withheld → NOT painted
  });

  it('paints nothing paintable when neither text feature is granted', () => {
    editor = mount({ grantedFeatures: ['tools.formatPainter'] });
    editor.setHTML('<p>hello</p>');
    selectAllText(editor);
    applyFormat(editor, boldItalic);
    const html = editor.getHTML();
    expect(html).not.toContain('<strong>');
    expect(html).not.toContain('<em>');
  });

  it('default grant-all paints both', () => {
    editor = mount({});
    editor.setHTML('<p>hello</p>');
    selectAllText(editor);
    applyFormat(editor, boldItalic);
    const html = editor.getHTML();
    expect(html).toContain('<strong>');
    expect(html).toContain('<em>');
  });
});
