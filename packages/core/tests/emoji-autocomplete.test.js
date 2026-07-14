/**
 * 17.5.6 — emoji `:shortcode` autocomplete: trigger detection, filtering,
 * and the full pick path through a real editor.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';
import { createEmojiPlugin } from '../src/plugins/emoji/emoji-plugin.js';
import { detectEmojiTrigger, filterEmojis } from '../src/plugins/emoji/emoji-autocomplete.js';
import { resolveEmojis } from '../src/plugins/emoji/emoji-data.js';

function textNode(s) {
  const p = document.createElement('p');
  p.textContent = s;
  return p.firstChild;
}

describe('17.5.6 — trigger detection (pure)', () => {
  it('fires on a colon-started token with ≥2 query chars', () => {
    expect(detectEmojiTrigger(textNode('hey :fi'), 7)).toEqual({ colonIndex: 4, query: 'fi' });
    expect(detectEmojiTrigger(textNode(':smile'), 6)).toEqual({ colonIndex: 0, query: 'smile' });
  });
  it('never fires on times, URLs, short or spaced queries', () => {
    expect(detectEmojiTrigger(textNode('at 5:30'), 7)).toBeNull();
    expect(detectEmojiTrigger(textNode('http://x'), 8)).toBeNull();
    expect(detectEmojiTrigger(textNode('a :f'), 4)).toBeNull();       // 1 char
    expect(detectEmojiTrigger(textNode('a :fi re'), 8)).toBeNull();   // space cancels
  });
});

describe('17.5.6 — filtering (pure)', () => {
  const data = resolveEmojis(null);
  it('matches labels and keywords, capped at 8', () => {
    const fire = filterEmojis(data, 'fire');
    expect(fire.length).toBeGreaterThan(0);
    expect(fire.length).toBeLessThanOrEqual(8);
    expect(filterEmojis(data, 'zzzzqq')).toHaveLength(0);
  });
});

describe('17.5.6 — through a real editor', () => {
  let editor, target;
  afterEach(() => {
    if (editor && !editor.isDestroyed()) editor.destroy();
    if (target && target.parentNode) target.remove();
    editor = target = null;
  });

  it('typing :fire opens the popup; Enter inserts the emoji at the token', () => {
    target = document.createElement('div');
    document.body.appendChild(target);
    editor = new OpenEditor(target, {});
    editor.plugins.install(createEmojiPlugin());
    editor.setHTML('<p>x</p>');
    const node = editor.getEditorElement().querySelector('p').firstChild;
    node.nodeValue = 'go :fire';
    editor.selection.set(node, 8, node, 8);
    editor.getEditorElement().dispatchEvent(new Event('input', { bubbles: true }));

    const popup = document.querySelector('.oe-caret-popup:not([hidden])');
    expect(popup).toBeTruthy();

    // Enter picks the active option via the plugin's key hook.
    const plugin = editor.plugins.get('emoji');
    const handled = plugin.onKeyDown(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    expect(handled).toBe(true);
    expect(node.nodeValue).toContain('go ');
    expect(node.nodeValue).not.toContain(':fire');
    expect(node.nodeValue.length).toBeGreaterThan(3); // emoji char present
  });
});
