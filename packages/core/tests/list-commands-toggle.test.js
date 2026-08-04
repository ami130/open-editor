/**
 * List command tests — Part A: ul/ol isActive, indent/outdent, handleListTab,
 * handleListEnter, listStyleType, setListStart, definitionList, and the
 * toolbar-outdent margin-based vs Shift+Tab structural distinction.
 * Split from list-commands.test.js to stay within the 300-line limit.
 */
import { describe, it, expect } from 'vitest';
import { OpenEditor } from '../src/editor.js';
import { handleListTab, handleListEnter } from '../src/commands/list-commands.js';

function makeTarget() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}
function cleanup(editor, target) {
  if (editor && !editor.isDestroyed()) editor.destroy();
  if (target && target.parentNode) target.parentNode.removeChild(target);
}
function makeEditorWith(html) {
  const target = makeTarget();
  const editor = new OpenEditor(target);
  editor.getEditorElement().innerHTML = html;
  return { editor, target };
}
function setCursor(node, offset = 0) {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
}

describe('ul / ol isActive', () => {
  it('ul isActive true inside <ul>', () => {
    const { editor, target } = makeEditorWith('<ul><li>item</li></ul>');
    setCursor(editor.getEditorElement().querySelector('li').firstChild, 0);
    expect(editor.commands.isActive('ul')).toBe(true);
    cleanup(editor, target);
  });

  it('ul isActive false inside <ol>', () => {
    const { editor, target } = makeEditorWith('<ol><li>item</li></ol>');
    setCursor(editor.getEditorElement().querySelector('li').firstChild, 0);
    expect(editor.commands.isActive('ul')).toBe(false);
    cleanup(editor, target);
  });

  it('ol isActive true inside <ol>', () => {
    const { editor, target } = makeEditorWith('<ol><li>item</li></ol>');
    setCursor(editor.getEditorElement().querySelector('li').firstChild, 0);
    expect(editor.commands.isActive('ol')).toBe(true);
    cleanup(editor, target);
  });

  it('both ul and ol isActive false outside any list', () => {
    const { editor, target } = makeEditorWith('<p>text</p>');
    setCursor(editor.getEditorElement().querySelector('p').firstChild, 0);
    expect(editor.commands.isActive('ul')).toBe(false);
    expect(editor.commands.isActive('ol')).toBe(false);
    cleanup(editor, target);
  });
});

describe('indent command', () => {
  it('does not throw when cursor is not in a list', () => {
    const { editor, target } = makeEditorWith('<p>text</p>');
    setCursor(editor.getEditorElement().querySelector('p').firstChild, 0);
    expect(() => editor.commands.execute('indent')).not.toThrow();
    cleanup(editor, target);
  });

  it('does not throw when first list item (cannot indent further)', () => {
    const { editor, target } = makeEditorWith('<ul><li>first</li></ul>');
    setCursor(editor.getEditorElement().querySelector('li').firstChild, 0);
    expect(() => editor.commands.execute('indent')).not.toThrow();
    cleanup(editor, target);
  });

  it('toolbar indent on a list item NESTS structurally (same model as Tab — L4)', () => {
    // L4: toolbar Indent/Outdent and Tab/Shift+Tab must share ONE indent model.
    // A list item now nests structurally (no margin), so Shift+Tab/Outdent can
    // undo it — the old margin-on-li behaviour left the two models unable to
    // reconcile.
    const { editor, target } = makeEditorWith('<ul><li>one</li><li>two</li></ul>');
    const items = editor.getEditorElement().querySelectorAll('li');
    setCursor(items[1].firstChild, 0);
    editor.commands.execute('indent');
    expect(items[1].style.marginLeft).toBe('');                 // NOT margin-based
    expect(editor.getEditorElement().querySelector('li ul, li ol')).not.toBeNull(); // nested
    // "two" now lives inside a sublist under "one"
    expect(editor.getEditorElement().querySelector('li ul li, li ol li').textContent).toBe('two');
    cleanup(editor, target);
  });

  it('toolbar outdent UNDOES a toolbar/Tab indent on a list item (L4 round-trip)', () => {
    const { editor, target } = makeEditorWith('<ul><li>one</li><li>two</li></ul>');
    const items = editor.getEditorElement().querySelectorAll('li');
    setCursor(items[1].firstChild, 0);
    editor.commands.execute('indent');                          // nest "two" under "one"
    expect(editor.getEditorElement().querySelector('li ul li, li ol li')).not.toBeNull();
    setCursor(editor.getEditorElement().querySelector('li ul li, li ol li').firstChild, 0);
    editor.commands.execute('outdent');                         // un-nest via toolbar
    expect(editor.getEditorElement().querySelector('li ul, li ol')).toBeNull();
    expect(editor.getEditorElement().querySelectorAll('ul > li').length).toBe(2);
    cleanup(editor, target);
  });
});

describe('outdent command', () => {
  it('does not throw when cursor is not in a list', () => {
    const { editor, target } = makeEditorWith('<p>text</p>');
    setCursor(editor.getEditorElement().querySelector('p').firstChild, 0);
    expect(() => editor.commands.execute('outdent')).not.toThrow();
    cleanup(editor, target);
  });
});

describe('handleListTab()', () => {
  it('returns false when cursor is not in a list', () => {
    const { editor, target } = makeEditorWith('<p>text</p>');
    setCursor(editor.getEditorElement().querySelector('p').firstChild, 0);
    expect(handleListTab(editor, false)).toBe(false);
    cleanup(editor, target);
  });

  it('returns true when cursor is in a list item (Tab)', () => {
    const { editor, target } = makeEditorWith('<ul><li>one</li><li>two</li></ul>');
    const items = editor.getEditorElement().querySelectorAll('li');
    setCursor(items[1].firstChild, 0);
    expect(handleListTab(editor, false)).toBe(true);
    cleanup(editor, target);
  });

  it('returns true when cursor is in a list item (Shift+Tab)', () => {
    const { editor, target } = makeEditorWith('<ul><li>item</li></ul>');
    setCursor(editor.getEditorElement().querySelector('li').firstChild, 0);
    expect(handleListTab(editor, true)).toBe(true);
    cleanup(editor, target);
  });
});

describe('handleListEnter()', () => {
  it('returns false when cursor is not in a list', () => {
    const { editor, target } = makeEditorWith('<p>text</p>');
    setCursor(editor.getEditorElement().querySelector('p').firstChild, 0);
    expect(handleListEnter(editor)).toBe(false);
    cleanup(editor, target);
  });

  it('returns false when list item is not empty', () => {
    const { editor, target } = makeEditorWith('<ul><li>content</li></ul>');
    setCursor(editor.getEditorElement().querySelector('li').firstChild, 0);
    expect(handleListEnter(editor)).toBe(false);
    cleanup(editor, target);
  });

  it('returns true and exits list when <li> is empty', () => {
    const { editor, target } = makeEditorWith('<ul><li></li></ul>');
    const li = editor.getEditorElement().querySelector('li');
    li.innerHTML = '<br>';
    setCursor(li, 0);
    const result = handleListEnter(editor);
    expect(result).toBe(true);
    expect(editor.getEditorElement().querySelector('p')).not.toBeNull();
    cleanup(editor, target);
  });
});

describe('listStyleType command', () => {
  it('sets list-style-type on the nearest list', () => {
    const { editor, target } = makeEditorWith('<ul><li>item</li></ul>');
    const li = editor.getEditorElement().querySelector('li');
    setCursor(li.firstChild, 0);
    editor.commands.execute('listStyleType', 'square');
    expect(editor.getEditorElement().querySelector('ul').style.listStyleType).toBe('square');
    cleanup(editor, target);
  });

  it('does not throw when cursor is outside a list', () => {
    const { editor, target } = makeEditorWith('<p>text</p>');
    setCursor(editor.getEditorElement().querySelector('p').firstChild, 0);
    expect(() => editor.commands.execute('listStyleType', 'disc')).not.toThrow();
    cleanup(editor, target);
  });
});

describe('setListStart command', () => {
  it('sets start attribute on <ol>', () => {
    const { editor, target } = makeEditorWith('<ol><li>item</li></ol>');
    setCursor(editor.getEditorElement().querySelector('li').firstChild, 0);
    editor.commands.execute('setListStart', 5);
    expect(editor.getEditorElement().querySelector('ol').getAttribute('start')).toBe('5');
    cleanup(editor, target);
  });

  it('does not apply to <ul>', () => {
    const { editor, target } = makeEditorWith('<ul><li>item</li></ul>');
    setCursor(editor.getEditorElement().querySelector('li').firstChild, 0);
    editor.commands.execute('setListStart', 3);
    expect(editor.getEditorElement().querySelector('ul').getAttribute('start')).toBeNull();
    cleanup(editor, target);
  });

  it('preserves start="0" (valid zero-indexed ordered list)', () => {
    const { editor, target } = makeEditorWith('<ol><li>item</li></ol>');
    setCursor(editor.getEditorElement().querySelector('li').firstChild, 0);
    editor.commands.execute('setListStart', 0);
    expect(editor.getEditorElement().querySelector('ol').getAttribute('start')).toBe('0');
    cleanup(editor, target);
  });

  it('clamps a negative start to 0', () => {
    const { editor, target } = makeEditorWith('<ol><li>item</li></ol>');
    setCursor(editor.getEditorElement().querySelector('li').firstChild, 0);
    editor.commands.execute('setListStart', -5);
    expect(editor.getEditorElement().querySelector('ol').getAttribute('start')).toBe('0');
    cleanup(editor, target);
  });
});

describe('definitionList command', () => {
  it('inserts a <dl> with <dt> and <dd>', () => {
    const { editor, target } = makeEditorWith('<p>text</p>');
    setCursor(editor.getEditorElement().querySelector('p').firstChild, 0);
    editor.commands.execute('definitionList');
    expect(editor.getEditorElement().querySelector('dl')).not.toBeNull();
    expect(editor.getEditorElement().querySelector('dt')).not.toBeNull();
    expect(editor.getEditorElement().querySelector('dd')).not.toBeNull();
    cleanup(editor, target);
  });
});

describe('outdent top-level non-empty list item', () => {
  it('toolbar outdent on a top-level <li> converts it to <p> (L4: same as Shift+Tab)', () => {
    // L4: toolbar Outdent now uses the structural model (like Shift+Tab), so a
    // top-level item leaves the list and becomes a paragraph — no more margin.
    const { editor, target } = makeEditorWith('<ul><li>hello</li></ul>');
    const li = editor.getEditorElement().querySelector('li');
    setCursor(li.firstChild, 0);
    editor.commands.execute('outdent');
    const p = editor.getEditorElement().querySelector('p');
    expect(p).not.toBeNull();
    expect(p.textContent).toBe('hello');
    expect(editor.getEditorElement().querySelector('ul')).toBeNull();
    cleanup(editor, target);
  });

  it('Shift+Tab on top-level <li> converts it to a <p> (T5)', () => {
    const { editor, target } = makeEditorWith('<ul><li>world</li></ul>');
    const li = editor.getEditorElement().querySelector('li');
    setCursor(li.firstChild, 0);
    handleListTab(editor, true);
    const p = editor.getEditorElement().querySelector('p');
    expect(p).not.toBeNull();
    expect(p.textContent).toContain('world');
    cleanup(editor, target);
  });
});
