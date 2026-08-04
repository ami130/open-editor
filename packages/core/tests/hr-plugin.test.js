/**
 * hr-plugin.test.js — click-to-select + restyle a horizontal rule, and prove the
 * inline style survives the sanitizer round-trip. Page breaks must be ignored.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';
import { createHorizontalRulePlugin, horizontalRulePlugin } from '../src/plugins/horizontal-rule/hr-plugin.js';

let editor;
beforeEach(() => { editor = createTestEditor(); });
afterEach(() => {
  if (!editor.isDestroyed()) editor.destroy();
  if (editor._target && editor._target.parentNode) editor._target.remove();
});

/** Mount the plugin + put an <hr> (optionally a page break) in the editor. */
function withHr({ pageBreak = false } = {}) {
  const p = createHorizontalRulePlugin();
  editor.plugins.install(p);
  editor.setHTML(`<p>above</p><hr${pageBreak ? ' class="oe-page-break"' : ''}><p>below</p>`);
  const hr = editor.getEditorElement().querySelector('hr');
  return { p, hr };
}

/** Simulate a REAL mousedown on a node — dispatched on the editable so it goes
 *  through the editor's actual event wiring (editor-events re-emits 'mousedown'),
 *  exactly like a browser click. (The old version emitted synthetically and thus
 *  missed the real-path bug where selectionChange insta-closed the popover.) */
function clickOn(node) {
  const ev = new window.MouseEvent('mousedown', { bubbles: true, cancelable: true });
  node.dispatchEvent(ev);
}

describe('createHorizontalRulePlugin — contract', () => {
  it('exposes the plugin contract', () => {
    const p = createHorizontalRulePlugin();
    expect(p.name).toBe('horizontalRule');
    expect(typeof p.install).toBe('function');
    expect(typeof p.destroy).toBe('function');
  });
  it('exports a singleton', () => {
    expect(horizontalRulePlugin.name).toBe('horizontalRule');
  });
});

describe('select + restyle', () => {
  it('clicking a decorative <hr> selects it and opens the restyle popover', () => {
    const { hr } = withHr();
    clickOn(hr);
    expect(hr.classList.contains('oe-hr--selected')).toBe(true);
    const pop = editor.getContainer().querySelector('.oe-hr-popover');
    expect(pop).toBeTruthy();
  });

  it('a selectionChange right after selecting does NOT insta-close the popover (the click bug)', () => {
    const { hr } = withHr();
    clickOn(hr);
    expect(hr.classList.contains('oe-hr--selected')).toBe(true);
    // The browser fires selectionChange as a side effect of the click. With no
    // real text caret, the popover must STAY open (regression guard for the bug
    // where any selectionChange closed it immediately).
    editor.emit('selectionChange', null);
    expect(hr.classList.contains('oe-hr--selected')).toBe(true);
    expect(editor.getContainer().querySelector('.oe-hr-popover')).toBeTruthy();
  });

  it('clicking a PAGE BREAK does NOT select/restyle it (print marker left alone)', () => {
    const { hr } = withHr({ pageBreak: true });
    clickOn(hr);
    expect(hr.classList.contains('oe-hr--selected')).toBe(false);
    expect(editor.getContainer().querySelector('.oe-hr-popover')).toBeNull();
  });

  it('_apply writes border-top color/style/width as inline style + fires afterCommand', () => {
    const { p, hr } = withHr();
    clickOn(hr);
    let fired = null;
    editor.on('afterCommand', (e) => { if (e.command === 'hrStyle') fired = e.args[0]; });
    p._apply(hr, { color: '#e53935', style: 'dashed', width: '4px' });
    expect(hr.style.borderTopColor).toBeTruthy();
    expect(hr.style.borderTopStyle).toBe('dashed');
    expect(hr.style.borderTopWidth).toBe('4px');
    expect(fired).toBeTruthy(); // change signalled via the frozen afterCommand event
  });

  it('the popover embeds the ADVANCED color picker panel', () => {
    const { hr } = withHr();
    clickOn(hr);
    const pop = editor.getContainer().querySelector('.oe-hr-popover');
    // The shared engine builds a panel with the gradient canvas + hex input.
    expect(pop.querySelector('.oe-hr-popover__picker')).toBeTruthy();
    expect(pop.querySelector('.oe-cp__grad, canvas')).toBeTruthy();
  });

  it('the popover has a customizable numeric HEIGHT control (clamped)', () => {
    const { hr } = withHr();
    clickOn(hr);
    const num = editor.getContainer().querySelector('.oe-hr-popover__num');
    expect(num).toBeTruthy();
    expect(num.getAttribute('type')).toBe('number');
    // Over-max value clamps on commit.
    num.value = '999';
    num.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(parseInt(hr.style.borderTopWidth, 10)).toBeLessThanOrEqual(24);
  });

  it('the popover is anchored to the WRAPPER, not inside the editable (no getHTML pollution)', () => {
    const { hr } = withHr();
    clickOn(hr);
    // It must NOT live inside the editable (whose innerHTML becomes getHTML()).
    const editable = editor.getEditorElement();
    expect(editable.querySelector('.oe-hr-popover')).toBeNull();
    // getHTML() must contain no popover markup.
    expect(editor.getHTML()).not.toContain('oe-hr-popover');
  });

  it('the applied style SURVIVES the getHTML() sanitizer round-trip', () => {
    const { p, hr } = withHr();
    p._apply(hr, { color: '#e53935', style: 'dashed', width: '3px' });
    const html = editor.getHTML();
    // The <hr> keeps a style attribute with the border styling (sanitizer allows it).
    expect(html).toMatch(/<hr[^>]*style="[^"]*border-top/i);
    expect(html.toLowerCase()).toContain('dashed');
    // Re-load it and confirm it's still there (true persistence).
    editor.setHTML(html);
    const hr2 = editor.getEditorElement().querySelector('hr');
    expect(hr2.getAttribute('style')).toMatch(/border-top/i);
  });

  it('an OUTSIDE mousedown deselects and closes the popover', async () => {
    const { hr } = withHr();
    clickOn(hr);
    expect(editor.getContainer().querySelector('.oe-hr-popover')).toBeTruthy();
    // The outside-close listener attaches on the next tick (so the opening click
    // can't close it) — wait for it, then dispatch a real document mousedown
    // outside the popover + rule.
    await new Promise((r) => setTimeout(r, 0));
    const p2 = editor.getEditorElement().querySelector('p');
    p2.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(hr.classList.contains('oe-hr--selected')).toBe(false);
    expect(editor.getContainer().querySelector('.oe-hr-popover')).toBeNull();
  });

  it('the OPENING click does NOT close the popover (async outside-listener attaches next tick)', async () => {
    const { hr } = withHr();
    clickOn(hr);
    // Immediately after the click — before the next tick — it must be open.
    expect(editor.getContainer().querySelector('.oe-hr-popover')).toBeTruthy();
    // And it stays open across a tick with no further interaction.
    await new Promise((r) => setTimeout(r, 0));
    expect(hr.classList.contains('oe-hr--selected')).toBe(true);
    expect(editor.getContainer().querySelector('.oe-hr-popover')).toBeTruthy();
  });

  it('destroy() removes the popover + deselects (no leak)', () => {
    const { p, hr } = withHr();
    clickOn(hr);
    p.destroy();
    expect(editor.getContainer().querySelector('.oe-hr-popover')).toBeNull();
  });

  // ─── I3: readonly must block the restyle popover entirely ────────────────────
  it('I3: a readonly editor does NOT open the restyle popover on hr click', () => {
    const { hr } = withHr();
    editor.setReadOnly(true);
    clickOn(hr);
    expect(editor.getContainer().querySelector('.oe-hr-popover')).toBeNull();
    expect(hr.classList.contains('oe-hr--selected')).toBe(false);
  });

  it('I3: _apply is a no-op in a readonly editor (rule style unchanged)', () => {
    const { p, hr } = withHr();
    clickOn(hr);                              // open while editable
    editor.setReadOnly(true);                 // now go readonly
    const before = hr.getAttribute('style') || '';
    p._apply(hr, { color: 'rgb(255,0,0)' });
    expect(hr.getAttribute('style') || '').toBe(before);   // unchanged
  });
});
