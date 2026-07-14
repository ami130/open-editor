/**
 * Toolbar system tests — Part B: aria-pressed correctness (F1), roving
 * tabindex (F3), fontSize dropdown, fullscreen ESC leak fix, dropdown
 * outside-click regression, and core-fix verifications.
 * Split from toolbar.test.js (Phase 7) to stay within the 300-line limit.
 */
import { describe, it, expect, vi } from 'vitest';
import { OpenEditor } from '../src/editor.js';

function makeEditor(config = {}) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const editor = new OpenEditor(target, config);
  return { editor, target };
}
function cleanup(editor, target) {
  if (editor && !editor.isDestroyed()) editor.destroy();
  if (target && target.parentNode) target.parentNode.removeChild(target);
}

describe('F1 — aria-pressed only on toggle commands', () => {
  it('bold button has aria-pressed (toggle command has isActive)', () => {
    const { editor, target } = makeEditor();
    const btn = target.querySelector('.oe-tb__btn[data-name="bold"]');
    editor.toolbar._syncNow();
    expect(btn.hasAttribute('aria-pressed')).toBe(true);
    cleanup(editor, target);
  });

  it('undo button has no aria-pressed (no isActive handler)', () => {
    const { editor, target } = makeEditor();
    const btn = target.querySelector('.oe-tb__btn[data-name="undo"]');
    editor.toolbar._syncNow();
    expect(btn.hasAttribute('aria-pressed')).toBe(false);
    cleanup(editor, target);
  });

  it('redo button has no aria-pressed', () => {
    const { editor, target } = makeEditor();
    const btn = target.querySelector('.oe-tb__btn[data-name="redo"]');
    editor.toolbar._syncNow();
    expect(btn.hasAttribute('aria-pressed')).toBe(false);
    cleanup(editor, target);
  });

  it('removeFormat button has no aria-pressed', () => {
    const { editor, target } = makeEditor();
    const btn = target.querySelector('.oe-tb__btn[data-name="removeFormat"]');
    editor.toolbar._syncNow();
    expect(btn.hasAttribute('aria-pressed')).toBe(false);
    cleanup(editor, target);
  });

  it('custom button with item.isActive honored in update()', () => {
    let flag = false;
    const { editor, target } = makeEditor({
      toolbar: {
        items: [[
          { type: 'button', name: 'myBtn', command: 'bold', icon: 'bold', labelKey: 'bold',
            isActive: () => flag },
        ]],
      },
    });
    const btn = target.querySelector('.oe-tb__btn[data-name="myBtn"]');
    editor.toolbar._syncNow();
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    flag = true;
    editor.toolbar._syncNow();
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    cleanup(editor, target);
  });
});

describe('F3 — roving tabindex uses actual trigger buttons', () => {
  it('_focusables for dropdown controls is the trigger button, not the wrapper div', () => {
    const { editor, target } = makeEditor();
    const focusables = editor.toolbar._focusables;
    for (const el of focusables) {
      expect(el.tagName.toLowerCase()).toBe('button');
    }
    cleanup(editor, target);
  });
});

describe('fontSize dropdown (7.8)', () => {
  it('renders a fontSize dropdown in the toolbar', () => {
    const { editor, target } = makeEditor();
    const triggers = Array.from(target.querySelectorAll('.oe-tb__dd-trigger'));
    const found = triggers.some((t) => {
      const label = t.querySelector('.oe-tb__dd-label');
      return label && label.textContent === 'Size';
    });
    expect(found).toBe(true);
    cleanup(editor, target);
  });

  it('fontSize dropdown options execute fontSize command', () => {
    const { editor, target } = makeEditor();
    const spy = vi.spyOn(editor.commands, 'execute');
    const triggers = Array.from(target.querySelectorAll('.oe-tb__dd-trigger'));
    const fsTrigger = triggers.find((t) => {
      const label = t.querySelector('.oe-tb__dd-label');
      return label && label.textContent === 'Size';
    });
    expect(fsTrigger).toBeTruthy();
    fsTrigger.click();
    const opt = Array.from(document.querySelectorAll('.oe-tb__dd-option'))
      .find((el) => !el.closest('[hidden]'));
    if (opt) opt.click();
    expect(spy).toHaveBeenCalledWith('fontSize', expect.any(String));
    cleanup(editor, target);
  });

  it('fontSize command is registered in command manager', () => {
    const { editor, target } = makeEditor();
    expect(editor.commands._commands.has('fontSize')).toBe(true);
    cleanup(editor, target);
  });
});

describe('Fullscreen ESC leak fix', () => {
  it('destroy while in fullscreen does not leave a dangling keydown listener', () => {
    const { editor, target } = makeEditor();
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    editor.toggleFullscreen();
    expect(editor.isFullscreen()).toBe(true);
    editor.destroy();
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function), true);
    removeSpy.mockRestore();
    if (target.parentNode) target.parentNode.removeChild(target);
  });
});

describe('Dropdown outside-click regression (panel mounted on body)', () => {
  it('clicking a dropdown option does not self-close the panel on mousedown', () => {
    const { editor, target } = makeEditor();
    editor.getEditorElement().innerHTML = '<p>hello</p>';
    const toolbarEl = editor.toolbar.getElement();
    const trigger = toolbarEl.querySelectorAll('.oe-tb__dd-trigger')[0];

    trigger.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    trigger.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    const panel = document.body.querySelector('.oe-tb__dd-panel:not([hidden])');
    expect(panel).not.toBeNull();

    const opt = panel.querySelector('.oe-tb__dd-option');
    opt.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));

    expect(panel.hidden).toBe(false);
    expect(document.body.contains(panel)).toBe(true);
    cleanup(editor, target);
  });

  it('destroying the editor while a dropdown is OPEN removes its scroll/resize listeners (no leak)', () => {
    const { editor, target } = makeEditor();
    const docRemove = vi.spyOn(document, 'removeEventListener');
    const winRemove = vi.spyOn(window, 'removeEventListener');

    const toolbarEl = editor.toolbar.getElement();
    const trigger = toolbarEl.querySelectorAll('.oe-tb__dd-trigger')[0];
    trigger.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    trigger.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    // panel is open
    expect(document.body.querySelector('.oe-tb__dd-panel:not([hidden])')).not.toBeNull();

    editor.destroy(); // must tear the open dropdown down cleanly

    const removedScroll = docRemove.mock.calls.some((c) => c[0] === 'scroll');
    const removedResize = winRemove.mock.calls.some((c) => c[0] === 'resize');
    expect(removedScroll).toBe(true);
    expect(removedResize).toBe(true);

    docRemove.mockRestore(); winRemove.mockRestore();
    if (target && target.parentNode) target.parentNode.removeChild(target);
  });

  it('heading dropdown applies H2 when an option is clicked with a live selection', () => {
    const { editor, target } = makeEditor();
    editor.getEditorElement().innerHTML = '<p>hello</p>';
    const p = editor.getEditorElement().querySelector('p');
    const sel = () => {
      const r = document.createRange();
      r.selectNodeContents(p.firstChild);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
    };
    sel();

    const toolbarEl = editor.toolbar.getElement();
    const trigger = toolbarEl.querySelectorAll('.oe-tb__dd-trigger')[0];
    trigger.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    trigger.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    const panel = document.body.querySelector('.oe-tb__dd-panel:not([hidden])');
    const h2opt = Array.from(panel.querySelectorAll('.oe-tb__dd-option'))
      .find((o) => /2/.test(o.textContent));

    sel();
    h2opt.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    h2opt.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    expect(editor.getEditorElement().querySelector('h2')).not.toBeNull();
    cleanup(editor, target);
  });
});

describe('Core fixes folded into Phase 7', () => {
  it('F3: isEmpty() is false when only an <hr> is present', () => {
    const { editor, target } = makeEditor();
    editor.getEditorElement().innerHTML = '<hr>';
    expect(editor.isEmpty()).toBe(false);
    cleanup(editor, target);
  });
  it('F3: isEmpty() is false for a table with no text', () => {
    const { editor, target } = makeEditor();
    editor.getEditorElement().innerHTML = '<table><tr><td></td></tr></table>';
    expect(editor.isEmpty()).toBe(false);
    cleanup(editor, target);
  });
  it('F4: {readonly:true} applies oe-disabled class + aria-disabled at init', () => {
    const { editor, target } = makeEditor({ readonly: true });
    const wrapper = target.querySelector('.oe-wrapper');
    expect(wrapper.classList.contains('oe-disabled')).toBe(true);
    expect(editor.getEditorElement().getAttribute('aria-disabled')).toBe('true');
    cleanup(editor, target);
  });
});

// 2.3 — read-only must visibly disable the TOOLBAR, not just the content area.
describe('2.3 — toolbar reflects read-only state', () => {
  it('setReadOnly(true) disables the toolbar; false restores it', () => {
    const { editor, target } = makeEditor();
    const bar = target.querySelector('.oe-toolbar');
    expect(bar.classList.contains('oe-toolbar--disabled')).toBe(false);

    editor.setReadOnly(true);
    expect(bar.classList.contains('oe-toolbar--disabled')).toBe(true);
    expect(bar.getAttribute('aria-disabled')).toBe('true');
    const tabs = Array.from(bar.querySelectorAll('[tabindex]'));
    expect(tabs.every((b) => b.getAttribute('tabindex') === '-1')).toBe(true);

    editor.setReadOnly(false);
    expect(bar.classList.contains('oe-toolbar--disabled')).toBe(false);
    expect(bar.getAttribute('aria-disabled')).toBe('false');
    cleanup(editor, target);
  });

  it('a {readonly:true} editor starts with a disabled toolbar', () => {
    const { editor, target } = makeEditor({ readonly: true });
    const bar = target.querySelector('.oe-toolbar');
    expect(bar.classList.contains('oe-toolbar--disabled')).toBe(true);
    expect(bar.getAttribute('aria-disabled')).toBe('true');
    cleanup(editor, target);
  });
});
