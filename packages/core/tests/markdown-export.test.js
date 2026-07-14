/**
 * 17.5.12 — getMarkdown(): every construct the serializer claims.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';

let editor, target;
function md(html) {
  target = document.createElement('div');
  document.body.appendChild(target);
  editor = new OpenEditor(target, {});
  editor.setHTML(html);
  return editor.getMarkdown();
}
afterEach(() => {
  if (editor && !editor.isDestroyed()) editor.destroy();
  if (target && target.parentNode) target.remove();
  editor = target = null;
});

describe('17.5.12 — markdown export', () => {
  it('headings, emphasis, code, strikethrough', () => {
    expect(md('<h2>Title</h2><p>a <strong>b</strong> <em>c</em> <code>d()</code> <s>e</s></p>'))
      .toBe('## Title\n\na **b** *c* `d()` ~~e~~\n');
  });

  it('links, images, figures with captions', () => {
    expect(md('<p><a href="https://x.com">go</a></p>')).toBe('[go](https://x.com)\n');
    expect(md('<figure class="oe-figure" contenteditable="false" data-oe-island="image"><img src="https://x/i.png" alt="pic"><figcaption contenteditable="true" data-oe-caption="">The Cap</figcaption></figure>'))
      .toBe('![The Cap](https://x/i.png)\n');
  });

  it('nested lists + to-do items', () => {
    const out = md('<ul><li>one<ul><li>sub</li></ul></li></ul>'
      + '<ul data-todo-list><li data-todo data-checked="true" role="checkbox" aria-checked="true">done it</li></ul>');
    expect(out).toContain('- one\n  - sub');
    expect(out).toContain('- [x] done it');
  });

  it('ordered lists number correctly', () => {
    expect(md('<ol><li>a</li><li>b</li></ol>')).toBe('1. a\n2. b\n');
  });

  it('blockquote, hr, code fence with language', () => {
    expect(md('<blockquote><p>quoted</p></blockquote>')).toBe('> quoted\n');
    expect(md('<hr>')).toBe('---\n');
    expect(md('<pre><code class="language-js">const x = 1;</code></pre>'))
      .toBe('```js\nconst x = 1;\n```\n');
  });

  it('GFM table with header row', () => {
    const out = md('<table><tbody><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></tbody></table>');
    expect(out).toBe('| A | B |\n| --- | --- |\n| 1 | 2 |\n');
  });

  it('escapes markdown-significant characters in plain text', () => {
    expect(md('<p>2 * 3 [not a link] _plain_</p>'))
      .toBe('2 \\* 3 \\[not a link\\] \\_plain\\_\n');
  });

  it('bookmarks survive as inline anchors; empty editor gives empty string', () => {
    expect(md('<p>x <a id="sec" class="oe-bookmark" contenteditable="false"></a> y</p>'))
      .toContain('<a id="sec"></a>');
    expect(md('')).toBe('');
  });
});
