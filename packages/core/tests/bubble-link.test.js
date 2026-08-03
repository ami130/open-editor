/**
 * bubble-link.test.js — the bubble (inline) toolbar Link button.
 * It has no command: it activates the link plugin's toolbar button (opening the
 * link dialog) and is hidden when the link plugin isn't installed. The bubble is
 * built before plugins install, so visibility is resolved live via
 * _syncLinkVisibility (called on every reposition).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';
import { createLinkPlugin } from '../src/plugins/link/link-plugin.js';

let target, editor;
function mount(config) {
  target = document.createElement('div');
  document.body.appendChild(target);
  return new OpenEditor(target, { inlineToolbar: true, toolbar: true, ...config });
}
afterEach(() => { editor && editor.destroy && editor.destroy(); target && target.remove(); });

const linkBtn = (ed) => ed.inlineToolbar && ed.inlineToolbar._linkBtn;

describe('bubble toolbar — Link button', () => {
  it('the bubble includes a Link button (labelled "Insert Link")', () => {
    editor = mount({});
    const btn = linkBtn(editor);
    expect(btn).toBeTruthy();
    expect(btn.getAttribute('aria-label')).toBe('Insert Link');
    expect(btn.getAttribute('data-name')).toBe('bubbleLink');
  });

  it('is HIDDEN when the link plugin is not installed', () => {
    editor = mount({});
    editor.inlineToolbar._syncLinkVisibility();
    expect(linkBtn(editor).hidden).toBe(true);
  });

  it('becomes VISIBLE once the link plugin is installed', () => {
    editor = mount({});
    editor.plugins.install(createLinkPlugin());
    editor.inlineToolbar._syncLinkVisibility();
    expect(linkBtn(editor).hidden).toBe(false);
  });

  it('stays HIDDEN when the link plugin is installed but its toolbar button is not rendered (toolbar:false)', () => {
    // Regression: visibility must key off the RENDERED button, not merely
    // isInstalled('link') — otherwise the bubble shows a Link button that no-ops
    // because there's no toolbar button to activate.
    editor = mount({ toolbar: false });
    editor.plugins.install(createLinkPlugin());
    editor.inlineToolbar._syncLinkVisibility();
    expect(editor.getContainer().querySelector('.oe-tb__btn[data-name="insertLink"]')).toBeNull();
    expect(linkBtn(editor).hidden).toBe(true);
  });

  it('clicking the bubble Link button activates the link plugin toolbar button', () => {
    editor = mount({});
    editor.plugins.install(createLinkPlugin());
    editor.inlineToolbar._syncLinkVisibility();

    // Spy on the link plugin's toolbar button click (it opens the dialog).
    const pluginBtn = editor.getContainer().querySelector('.oe-tb__btn[data-name="insertLink"]');
    expect(pluginBtn).toBeTruthy();
    let clicked = false;
    pluginBtn.addEventListener('click', () => { clicked = true; });

    linkBtn(editor).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(clicked).toBe(true);
  });
});
