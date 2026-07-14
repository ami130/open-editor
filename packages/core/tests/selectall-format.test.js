/**
 * Regression: applying an inline format after Select-All must format INSIDE each
 * block, not wrap the block itself. Select-All produces a range whose boundaries
 * sit on the editor root (root[0]→root[1]), so start==end container. An earlier
 * refactor of rangeCrossesBlocks (from `commonAncestor === root` to a
 * start!==end-block test) lost this case, producing <s><p>…</p></s> — invalid,
 * and stripped to plain text by the sanitizer, so the format silently vanished.
 * This was caught by the e2e canonical-HTML snapshots; these lock it in jsdom.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';

let editor, target;
beforeEach(() => {
  target = document.createElement('div');
  document.body.appendChild(target);
  editor = new OpenEditor(target);
});
afterEach(() => {
  if (editor && !editor.isDestroyed()) editor.destroy();
  if (target && target.parentNode) target.remove();
});

describe('Select-All then inline format (regression)', () => {
  it('bold on a single selected block wraps the TEXT, not the <p>', () => {
    editor.getEditorElement().innerHTML = '<p>hello</p>';
    editor.commands.execute('selectAll');
    editor.commands.execute('bold');
    expect(editor.getHTML()).toBe('<p><strong>hello</strong></p>');
  });

  it('italic on a single selected block produces <em> inside the block', () => {
    editor.getEditorElement().innerHTML = '<p>italic</p>';
    editor.commands.execute('selectAll');
    editor.commands.execute('italic');
    expect(editor.getHTML()).toBe('<p><em>italic</em></p>');
  });

  it('strikethrough on a single selected block produces <s> inside the block', () => {
    editor.getEditorElement().innerHTML = '<p>struck</p>';
    editor.commands.execute('selectAll');
    editor.commands.execute('strikethrough');
    const html = editor.getHTML();
    expect(html).toContain('<s>');
    expect(html).not.toContain('<strike>');
    expect(html).not.toContain('<del>');
    expect(html).toBe('<p><s>struck</s></p>');
  });

  it('bold across multiple selected blocks wraps each block’s text', () => {
    editor.getEditorElement().innerHTML = '<p>aaa</p><p>bbb</p>';
    editor.commands.execute('selectAll');
    editor.commands.execute('bold');
    expect(editor.getHTML()).toBe('<p><strong>aaa</strong></p><p><strong>bbb</strong></p>');
  });

  it('never produces an inline tag wrapping a block element', () => {
    editor.getEditorElement().innerHTML = '<h2>title</h2>';
    editor.commands.execute('selectAll');
    editor.commands.execute('bold');
    const html = editor.getHTML();
    expect(html).not.toMatch(/<(strong|em|s|u)>\s*<(p|h[1-6]|div)/i);
    expect(html).toBe('<h2><strong>title</strong></h2>');
  });
});
