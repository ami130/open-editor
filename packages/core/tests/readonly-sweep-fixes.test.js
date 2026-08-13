/**
 * readonly-sweep-fixes.test.js — final-audit fixes for the systemic readonly /
 * undo-integration gap.
 *
 * ROOT CAUSE (found by the full-codebase audit): readonly is enforced centrally
 * at the toolbar (toolbar-button.js) and the keydown dispatcher — so ANY path
 * reached by right-click, a floating action bar, an in-content click, or a raw
 * mouse/input event must re-check for itself. Context menus were consistently
 * missed. Each block below is a path PROVEN mutable-while-readonly before the fix.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';
import { createTablePlugin } from '../src/plugins/table/table-plugin.js';
import { buildTableMenuItems } from '../src/plugins/table/table-contextmenu.js';
import { MediaSelectionManager } from '../src/plugins/media/media-selection.js';
import { buildEmbed } from '../src/plugins/media/media-dom.js';
import { ImageSelectionManager } from '../src/plugins/image/image-selection.js';
import { createMentionsPlugin } from '../src/plugins/mentions/mentions-plugin.js';

let editor, target;
function mk(config) {
  target = document.createElement('div');
  document.body.appendChild(target);
  editor = new OpenEditor(target, config || {});
  return editor;
}
afterEach(() => {
  if (editor && !editor.isDestroyed()) editor.destroy();
  if (target && target.parentNode) target.remove();
  editor = target = null;
});

describe('T1 — table context menu respects readonly', () => {
  function setup() {
    mk();
    editor.plugins.install(createTablePlugin());
    editor.setHTML('<table class="oe-table"><tbody><tr><td>a</td><td>b</td></tr></tbody></table>');
    const table = editor.getEditorElement().querySelector('table');
    return { table, cell: table.querySelector('td') };
  }

  it('Insert row below does NOT add a row while readonly', () => {
    const { table, cell } = setup();
    editor.setReadOnly(true);
    buildTableMenuItems(editor, cell, []).find((i) => i.label === 'Insert row below').action();
    expect(table.querySelectorAll('tr').length).toBe(1);
  });

  it('Delete row does NOT remove a row while readonly', () => {
    // `cell` is deliberately not destructured: setHTML below replaces the DOM
    // this test operates on, so the handle from setup() is stale immediately.
    const { table } = setup();
    editor.setHTML('<table class="oe-table"><tbody><tr><td>a</td></tr><tr><td>b</td></tr></tbody></table>');
    const t2 = editor.getEditorElement().querySelector('table');
    editor.setReadOnly(true);
    buildTableMenuItems(editor, t2.querySelector('td'), []).find((i) => i.label === 'Delete row').action();
    expect(t2.querySelectorAll('tr').length).toBe(2);
    expect(table).toBeTruthy();
  });

  it('still works normally when NOT readonly (guard is not over-broad)', () => {
    const { table, cell } = setup();
    buildTableMenuItems(editor, cell, []).find((i) => i.label === 'Insert row below').action();
    expect(table.querySelectorAll('tr').length).toBe(2);
  });
});

describe('T2 — media island respects readonly', () => {
  function setup() {
    mk();
    const mgr = new MediaSelectionManager();
    mgr.install(editor);
    const root = editor.getEditorElement();
    const fig = buildEmbed(editor, { provider: 'youtube', src: 'https://www.youtube-nocookie.com/embed/x' });
    root.innerHTML = '';
    root.appendChild(fig);
    return { mgr, fig, root };
  }

  it('deleteFigure does NOT remove the embed while readonly', () => {
    const { mgr, fig, root } = setup();
    editor.setReadOnly(true);
    mgr.deleteFigure(fig);
    expect(root.contains(fig)).toBe(true);
    mgr.destroy();
  });

  it('align() does NOT change alignment while readonly', () => {
    const { mgr, fig } = setup();
    editor.setReadOnly(true);
    mgr.align(fig, 'left');
    expect(fig.classList.contains('oe-embed--left')).toBe(false);
    mgr.destroy();
  });

  it('align() DOES work when not readonly, as one clean undo step', () => {
    const { mgr, fig } = setup();
    mgr.align(fig, 'left');
    expect(fig.classList.contains('oe-embed--left')).toBe(true);
    mgr.destroy();
  });
});

describe('T3 — image island respects readonly', () => {
  function setup() {
    mk();
    const mgr = new ImageSelectionManager();
    mgr.install(editor);
    editor.setHTML('<figure class="oe-figure" data-oe-island="image"><img src="data:image/png;base64,iVBORw0KGgo="></figure><p>x</p>');
    const fig = editor.getEditorElement().querySelector('figure');
    return { mgr, fig };
  }

  it('deleteFigure does NOT remove the image while readonly', () => {
    const { mgr, fig } = setup();
    editor.setReadOnly(true);
    mgr.deleteFigure(fig);
    expect(editor.getEditorElement().contains(fig)).toBe(true);
    mgr.destroy();
  });

  it('align() does NOT change alignment while readonly', () => {
    const { mgr, fig } = setup();
    editor.setReadOnly(true);
    mgr.align(fig, 'left');
    expect(fig.classList.contains('oe-figure--left')).toBe(false);
    mgr.destroy();
  });

  it('align() DOES work when not readonly', () => {
    const { mgr, fig } = setup();
    mgr.align(fig, 'left');
    expect(fig.classList.contains('oe-figure--left')).toBe(true);
    mgr.destroy();
  });
});

describe('T4 — mentions respects readonly and is undoable', () => {
  it('_applyPick does NOT insert a mention while readonly', () => {
    mk();
    editor.plugins.install(createMentionsPlugin());
    const plugin = editor.plugins.get('mentions');
    editor.setHTML('<p>hi @al</p>');
    const node = editor.getEditorElement().querySelector('p').firstChild;
    plugin._triggerNode = node;
    plugin._triggerAtIndex = 3;
    plugin._triggerLen = 3;
    editor.setReadOnly(true);
    const before = editor.getHTML();
    plugin._applyPick({ id: '1', label: 'Alice' });
    expect(editor.getHTML()).toBe(before);
  });

  it('_applyPick emits afterCommand so the insert is a real undo step', () => {
    mk();
    editor.plugins.install(createMentionsPlugin());
    const plugin = editor.plugins.get('mentions');
    editor.setHTML('<p>hi @al</p>');
    const node = editor.getEditorElement().querySelector('p').firstChild;
    plugin._triggerNode = node;
    plugin._triggerAtIndex = 3;
    plugin._triggerLen = 3;
    editor.selection.set(node, node.nodeValue.length);
    let cmd = null;
    editor.on('afterCommand', (p) => { cmd = p.command; });
    plugin._applyPick({ id: '1', label: 'Alice' });
    expect(cmd).toBe('insertMention');
  });
});

describe('T5 — canUndo() does not swallow the keypress', () => {
  it('reports false when a pending idle snapshot would only dedup', () => {
    mk();
    editor.setHTML('<p>x</p>');
    // Arm the idle timer WITHOUT changing the content — flushing it would dedup,
    // so _index can never advance and undo() would silently no-op.
    editor.history._scheduleIdleSnapshot();
    expect(editor.history.canUndo()).toBe(false);
  });

  it('still reports true when the pending snapshot IS new work', () => {
    mk();
    editor.setHTML('<p>x</p>');
    editor.getEditorElement().querySelector('p').textContent = 'x changed';
    editor.history._scheduleIdleSnapshot();
    expect(editor.history.canUndo()).toBe(true);
  });
});
