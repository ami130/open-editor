import { describe, it, expect } from 'vitest';
import { OpenEditor } from '../src/editor.js';

function makeEditor() {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const editor = new OpenEditor(target);
  editor.getEditorElement().innerHTML = '<p>hello world</p>';
  return { editor, target };
}
function selectAll(node) {
  const r = document.createRange();
  r.selectNodeContents(node);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(r);
}

describe('CSS injection guard still blocks dangerous values after # allow', () => {
  const dangerous = [
    'red; background: url(evil)',
    '#fff; } body {',
    'expression(alert(1))',  // has parens but the ; / : variants below are the breakouts
    '#fff;color:blue',
    'url(javascript:alert(1))',
    '#fff<script>',
    '#fff}',
    '#fff{',
  ];
  for (const val of dangerous) {
    it(`rejects "${val}"`, () => {
      const { editor, target } = makeEditor();
      const p = editor.getEditorElement().querySelector('p');
      selectAll(p.firstChild);
      editor.commands.execute('textColor', val);
      // Either no span created, or if created the dangerous chars are gone.
      const html = editor.getEditorElement().innerHTML;
      expect(html).not.toMatch(/<script|expression\(|url\(javascript|}\s*body|}\s*{/i);
      if (editor && !editor.isDestroyed()) editor.destroy();
      target.remove();
    });
  }

  it('allows safe values: #ff0000, rgb(255,0,0), red, hsl(0,100%,50%)', () => {
    for (const val of ['#ff0000', 'rgb(255,0,0)', 'red']) {
      const { editor, target } = makeEditor();
      const p = editor.getEditorElement().querySelector('p');
      selectAll(p.firstChild);
      editor.commands.execute('textColor', val);
      expect(editor.getEditorElement().querySelector('span'), `${val} should apply`).not.toBeNull();
      if (editor && !editor.isDestroyed()) editor.destroy();
      target.remove();
    }
  });
});
