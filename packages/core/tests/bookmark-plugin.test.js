/**
 * 17.5.7 — bookmarks: insert, round-trip, list, link-dialog integration.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';
import { createBookmarkPlugin, listBookmarks, removeBookmark, repairBookmarks } from '../src/plugins/bookmark/bookmark-plugin.js';
import { sanitize } from '../src/sanitizer/sanitizer.js';

let editor, target;
function make() {
  target = document.createElement('div');
  document.body.appendChild(target);
  editor = new OpenEditor(target, {});
  editor.plugins.install(createBookmarkPlugin());
  return editor;
}
afterEach(() => {
  if (editor && !editor.isDestroyed()) editor.destroy();
  if (target && target.parentNode) target.remove();
  editor = target = null;
  document.querySelectorAll('.oe-modal-backdrop, .oe-modal').forEach((n) => n.remove());
});

describe('17.5.7 — bookmarks', () => {
  it('a bookmark anchor survives the sanitizer round-trip with its id', () => {
    make();
    editor.setHTML('<p>before <a id="sec-1" class="oe-bookmark" contenteditable="false"></a> after</p>');
    const out = editor.getHTML();
    expect(out).toContain('id="sec-1"');
    expect(out).toContain('class="oe-bookmark"');
    editor.setHTML(out);
    expect(listBookmarks(editor)).toHaveLength(1);
  });

  it('listBookmarks finds all anchors', () => {
    make();
    editor.setHTML('<p><a id="a1" class="oe-bookmark"></a>x<a id="a2" class="oe-bookmark"></a></p>');
    expect(listBookmarks(editor).map((b) => b.id)).toEqual(['a1', 'a2']);
  });

  it('a "#anchor" href passes the link pipeline (fragment links are safe)', () => {
    make();
    const clean = sanitize('<p><a href="#sec-1">jump</a></p>', { document });
    expect(clean).toContain('href="#sec-1"');
  });

  it('toolbar button exists', () => {
    make();
    expect(target.querySelector('.oe-tb__btn[data-name="bookmark"]')).toBeTruthy();
  });

  // ─── insert flow (was previously untested — the real user path) ─────────────
  function clickSave() {
    const btn = Array.from(document.querySelectorAll('.oe-modal button'))
      .find((b) => /save/i.test(b.textContent));
    btn.click();
  }

  it('inserts a bookmark at the caret via the dialog', async () => {
    make();
    const plugin = editor.plugins.get('bookmark');
    editor.setHTML('<p>hello world</p>');
    const p = editor.getEditorElement().querySelector('p');
    const range = document.createRange();
    range.setStart(p.firstChild, 5); range.collapse(true);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);

    const done = plugin._openDialog(null);
    document.querySelector('.oe-bm-dialog__input').value = 'my-mark';
    clickSave();
    await done;

    const marks = listBookmarks(editor);
    expect(marks).toHaveLength(1);
    expect(marks[0].id).toBe('my-mark');
    // must land INSIDE the paragraph, never loose at the root
    expect(marks[0].closest('p')).toBeTruthy();
  });

  it('with no caret set, the bookmark still lands inside a block (not at root)', async () => {
    make();
    const plugin = editor.plugins.get('bookmark');
    editor.setHTML('<p>hello</p>');
    // deliberately set NO selection — simulates clicking the toolbar first
    window.getSelection().removeAllRanges();

    const done = plugin._openDialog(null);
    document.querySelector('.oe-bm-dialog__input').value = 'nofocus';
    clickSave();
    await done;

    const marks = listBookmarks(editor);
    expect(marks).toHaveLength(1);
    // the bug was `<a></a><p>hello</p>` — anchor must be inside the block
    expect(marks[0].parentElement.tagName).toBe('P');
  });

  it('clicking an existing bookmark renames it', async () => {
    make();
    const plugin = editor.plugins.get('bookmark');
    editor.setHTML('<p>x<a id="old" class="oe-bookmark" contenteditable="false"></a>y</p>');
    const mark = editor.getEditorElement().querySelector('a.oe-bookmark');

    const done = plugin._openDialog(mark);
    const input = document.querySelector('.oe-bm-dialog__input');
    expect(input.value).toBe('old');
    input.value = 'renamed';
    clickSave();
    await done;

    expect(listBookmarks(editor)[0].id).toBe('renamed');
  });

  it('injects its stylesheet into the editor document, honoring iframe mode', () => {
    // jsdom cannot build a real iframe editor (contentDocument is inaccessible),
    // so we assert the fix at the unit level: install() must inject into
    // `editor._iframeDoc` when present, not the host `document`. A separate
    // Playwright test covers the true iframe render.
    target = document.createElement('div');
    document.body.appendChild(target);
    editor = new OpenEditor(target, {}); // non-iframe editor (jsdom-buildable)
    const fakeIframeDoc = document.implementation.createHTMLDocument('frame');
    editor._iframeDoc = fakeIframeDoc; // simulate iframe mode for the plugin
    editor.plugins.install(createBookmarkPlugin());
    // the marker CSS must land in the iframe doc (the fix) — before the fix
    // this doc stayed empty because the plugin injected into host `document`.
    expect(fakeIframeDoc.getElementById('oe-bookmark-styles')).toBeTruthy();
  });

  // ─── Phase A: the three reported bugs (2026-07-16) ──────────────────────────
  describe('Phase A — text-preservation regressions', () => {
    it('inserting a bookmark over a SELECTION does not swallow the text', async () => {
      make();
      const plugin = editor.plugins.get('bookmark');
      editor.setHTML('<p>keep all of this text</p>');
      // select the whole paragraph's text (the flow that used to destroy it)
      const p = editor.getEditorElement().querySelector('p');
      const range = document.createRange();
      range.selectNodeContents(p);
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);

      const done = plugin._openDialog(null);
      document.querySelector('.oe-bm-dialog__input').value = 'sec';
      Array.from(document.querySelectorAll('.oe-modal button')).find((b) => /save/i.test(b.textContent)).click();
      await done;

      // text must be 100% intact, marker a SIBLING (empty, beside the text)
      const html = editor.getHTML();
      expect(editor.getEditorElement().textContent).toContain('keep all of this text');
      const mark = editor.getEditorElement().querySelector('a.oe-bookmark');
      expect(mark).toBeTruthy();
      expect(mark.childNodes.length).toBe(0); // marker is EMPTY — no swallowed text
      expect(html).toContain('keep all of this text');
    });

    it('removeBookmark deletes the marker but PRESERVES surrounding text', () => {
      make();
      editor.setHTML('<p>before <a id="m" class="oe-bookmark" contenteditable="false"></a>after</p>');
      const mark = editor.getEditorElement().querySelector('a.oe-bookmark');
      removeBookmark(editor, mark);
      expect(editor.getEditorElement().querySelector('a.oe-bookmark')).toBeNull();
      expect(editor.getEditorElement().textContent).toBe('before after');
    });

    it('removeBookmark UNWRAPS text trapped by the old bug (never deletes it)', () => {
      make();
      // simulate a corrupted marker: text is INSIDE the anchor
      editor.setHTML('<p>x<a id="m" class="oe-bookmark" contenteditable="false">trapped words</a>y</p>');
      const mark = editor.getEditorElement().querySelector('a.oe-bookmark');
      removeBookmark(editor, mark);
      expect(editor.getEditorElement().textContent).toBe('xtrapped wordsy');
    });

    it('repairBookmarks unwraps corrupted markers and leaves clean ones alone', () => {
      // Test repairBookmarks() in isolation on a detached tree, so the plugin's
      // auto-repair-on-setHTML hook doesn't pre-clean it before we measure.
      const root = document.createElement('div');
      root.innerHTML =
        '<p><a id="bad" class="oe-bookmark" contenteditable="false">was trapped</a>'
        + '<a id="good" class="oe-bookmark" contenteditable="false"></a></p>';
      const n = repairBookmarks(root);
      expect(n).toBe(1); // only the corrupted one repaired
      expect(root.textContent).toContain('was trapped');
      const marks = Array.from(root.querySelectorAll('a.oe-bookmark'));
      expect(marks).toHaveLength(2);
      expect(marks.every((m) => m.childNodes.length === 0)).toBe(true);
    });

    it('repair runs automatically when corrupted content is loaded via setHTML', () => {
      make();
      editor.plugins.get('bookmark'); // ensure installed
      editor.setHTML('<p>a<a id="m" class="oe-bookmark" contenteditable="false">rescued</a>b</p>');
      // the setHTML repair hook should have unwrapped it
      const mark = editor.getEditorElement().querySelector('a.oe-bookmark');
      expect(mark.childNodes.length).toBe(0);
      expect(editor.getEditorElement().textContent).toContain('rescued');
    });
  });

  // ─── Phase B: commands / undo / interaction ─────────────────────────────────
  describe('Phase B — commands, undo, interaction', () => {
    it('registers insertBookmark + removeBookmark commands', () => {
      make();
      expect(editor.commands.getAll().has('insertBookmark')).toBe(true);
      expect(editor.commands.getAll().has('removeBookmark')).toBe(true);
      // execute the insert command directly (bypassing the dialog)
      editor.setHTML('<p>hi</p>');
      const p = editor.getEditorElement().querySelector('p');
      editor.selection.collapse(p, p.childNodes.length);
      editor.commands.execute('insertBookmark', { name: 'cmd-mark' });
      expect(listBookmarks(editor).map((b) => b.id)).toContain('cmd-mark');
    });

    it('inserting a bookmark via command is undoable (one undo removes it)', () => {
      make();
      editor.setHTML('<p>text</p>');
      const p = editor.getEditorElement().querySelector('p');
      editor.selection.collapse(p, p.childNodes.length);
      editor.commands.execute('insertBookmark', { name: 'undoable' });
      expect(listBookmarks(editor)).toHaveLength(1);
      editor.commands.execute('undo');
      expect(listBookmarks(editor)).toHaveLength(0); // marker gone after undo
      expect(editor.getEditorElement().textContent).toContain('text'); // text intact
    });

    it('markers are keyboard-focusable with an aria-label', () => {
      make();
      editor.setHTML('<p>x<a id="k" class="oe-bookmark" contenteditable="false"></a></p>');
      const mark = editor.getEditorElement().querySelector('a.oe-bookmark');
      expect(mark.getAttribute('tabindex')).toBe('0');
      expect(mark.getAttribute('aria-label')).toContain('k');
    });
  });

  // ─── Phase C: icons, colors, sanitizer round-trip ──────────────────────────
  describe('Phase C — presentation (icons/colors)', () => {
    it('data-oe-icon and data-oe-color survive the sanitizer round-trip', () => {
      make();
      editor.setHTML('<p>intro <a id="styled" class="oe-bookmark" contenteditable="false" data-oe-icon="star" data-oe-color="amber"></a>body</p>');
      const out = editor.getHTML();
      expect(out).toContain('data-oe-icon="star"');
      expect(out).toContain('data-oe-color="amber"');
    });

    it('a malformed icon/color value is stripped by the plugin key-validator', async () => {
      const { applyPresentation } = await import('../src/plugins/bookmark/bookmark-core.js');
      const a = document.createElement('a');
      applyPresentation(a, 'star"><script>', 'red; evil');
      expect(a.hasAttribute('data-oe-icon')).toBe(false); // rejected: not SAFE_KEY_RE
      expect(a.hasAttribute('data-oe-color')).toBe(false);
      applyPresentation(a, 'star', 'red');
      expect(a.getAttribute('data-oe-icon')).toBe('star'); // clean values accepted
      expect(a.getAttribute('data-oe-color')).toBe('red');
    });

    it('ships at least 12 built-in icon designs', async () => {
      const { BUILTIN_ICONS } = await import('../src/plugins/bookmark/bookmark-config.js');
      expect(BUILTIN_ICONS.length).toBeGreaterThanOrEqual(12);
      // every icon has a value + a preview glyph, all keys SAFE
      expect(BUILTIN_ICONS.every((i) => /^[a-z][a-z0-9-]*$/.test(i.value) && i.glyph)).toBe(true);
    });

    it('a CUSTOM hex color stores as an inline var and survives round-trip', async () => {
      const { applyPresentation, readMarkerColor } = await import('../src/plugins/bookmark/bookmark-core.js');
      const a = document.createElement('a');
      applyPresentation(a, 'flag', '#3b82f6');       // custom hex
      expect(a.hasAttribute('data-oe-color')).toBe(false);            // not a preset key
      expect(a.style.getPropertyValue('--oe-bm-color').trim()).toBe('#3b82f6');
      expect(readMarkerColor(a)).toBe('#3b82f6');

      make();
      editor.setHTML('<p>x<a id="c" class="oe-bookmark" contenteditable="false" style="--oe-bm-color: #ff8800"></a>y</p>');
      expect(editor.getHTML()).toContain('--oe-bm-color: #ff8800');   // persists
    });

    it('an invalid custom color (not #hex) is rejected', async () => {
      const { applyPresentation } = await import('../src/plugins/bookmark/bookmark-core.js');
      const a = document.createElement('a');
      applyPresentation(a, 'flag', 'red; background:url(x)');         // injection attempt
      expect(a.style.getPropertyValue('--oe-bm-color')).toBe('');     // not written
      expect(a.hasAttribute('data-oe-color')).toBe(false);
    });

    it('preset and custom color are mutually exclusive', async () => {
      const { applyPresentation } = await import('../src/plugins/bookmark/bookmark-core.js');
      const a = document.createElement('a');
      applyPresentation(a, 'flag', 'amber');
      expect(a.getAttribute('data-oe-color')).toBe('amber');
      applyPresentation(a, 'flag', '#123456');                       // switch to custom
      expect(a.hasAttribute('data-oe-color')).toBe(false);            // preset cleared
      expect(a.style.getPropertyValue('--oe-bm-color').trim()).toBe('#123456');
      applyPresentation(a, 'flag', 'green');                         // back to preset
      expect(a.style.getPropertyValue('--oe-bm-color')).toBe('');     // custom cleared
      expect(a.getAttribute('data-oe-color')).toBe('green');
    });

    it('resolveBookmarkConfig: icons AND colors default ON; null/false disables', async () => {
      const { resolveBookmarkConfig } = await import('../src/plugins/bookmark/bookmark-config.js');
      const def = resolveBookmarkConfig({});
      expect(def.icons.length).toBeGreaterThan(0);   // built-in icons by default
      expect(def.colors.length).toBeGreaterThan(0);  // built-in palette by default
      expect(def.panel).toBe(false);                 // navigator opt-in
      expect(def.iconSize).toBeNull();               // default 1em via CSS
      expect(resolveBookmarkConfig({ bookmarkColors: null }).colors).toBeNull();
      expect(resolveBookmarkConfig({ bookmarkColors: false }).colors).toBeNull();
      expect(resolveBookmarkConfig({ bookmarkIcons: null }).icons).toBeNull();
      expect(resolveBookmarkConfig({ bookmarkIcons: false }).icons).toBeNull();
    });

    // ── the color-state model (fixed 2026-07-16: "color not working") ────────
    describe('dialog color-state model', () => {
      function openDialog(existingHtml = '<p>hello world</p>', existingSel = null) {
        make();
        const plugin = editor.plugins.get('bookmark');
        editor.setHTML(existingHtml);
        const p = editor.getEditorElement().querySelector('p');
        const range = document.createRange();
        range.setStart(p.firstChild || p, 0); range.collapse(true);
        const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
        const existing = existingSel ? editor.getEditorElement().querySelector(existingSel) : null;
        const done = plugin._openDialog(existing);
        return { plugin, done };
      }
      const save = () => Array.from(document.querySelectorAll('.oe-modal button'))
        .find((b) => /save/i.test(b.textContent)).click();

      it('typing a hex into the embedded picker then Save applies that color (drag-class path)', async () => {
        const { done } = openDialog();
        document.querySelector('.oe-bm-dialog__input').value = 'hexed';
        const hexInput = document.querySelector('.oe-bm-dialog__cp .oe-cp__hex-input');
        expect(hexInput).toBeTruthy();                 // the REAL panel is embedded
        hexInput.value = '#112233';
        hexInput.dispatchEvent(new Event('input', { bubbles: true })); // marks dirty + engine setHex
        save();
        await done;
        const mark = editor.getEditorElement().querySelector('a.oe-bookmark');
        expect(mark.style.getPropertyValue('--oe-bm-color').trim()).toBe('#112233');
      });

      it('NOT touching the color section leaves the marker with no color', async () => {
        const { done } = openDialog();
        document.querySelector('.oe-bm-dialog__input').value = 'plain';
        save();
        await done;
        const mark = editor.getEditorElement().querySelector('a.oe-bookmark');
        expect(mark.style.getPropertyValue('--oe-bm-color')).toBe('');
        expect(mark.hasAttribute('data-oe-color')).toBe(false);
      });

      it('Clear then Save removes the color even after interacting', async () => {
        const { done } = openDialog(
          '<p>x<a id="had" class="oe-bookmark" contenteditable="false" style="--oe-bm-color: #ff0000"></a>y</p>',
          'a.oe-bookmark');
        const hexInput = document.querySelector('.oe-bm-dialog__cp .oe-cp__hex-input');
        hexInput.value = '#00ff00';
        hexInput.dispatchEvent(new Event('input', { bubbles: true }));   // interact…
        document.querySelector('.oe-bm-dialog__cp .oe-cp__clear-btn').click(); // …then Clear
        save();
        await done;
        const mark = editor.getEditorElement().querySelector('a.oe-bookmark');
        expect(mark.style.getPropertyValue('--oe-bm-color')).toBe('');   // color gone
      });

      it('editing an existing colored bookmark WITHOUT touching color keeps it', async () => {
        const { done } = openDialog(
          '<p>x<a id="keepme" class="oe-bookmark" contenteditable="false" style="--oe-bm-color: #ff8800"></a>y</p>',
          'a.oe-bookmark');
        save();
        await done;
        const mark = editor.getEditorElement().querySelector('a.oe-bookmark');
        expect(mark.style.getPropertyValue('--oe-bm-color').trim()).toBe('#ff8800');
      });
    });

    it('bookmarkIconSize: number→px, valid CSS length kept, junk rejected', async () => {
      const { resolveBookmarkConfig } = await import('../src/plugins/bookmark/bookmark-config.js');
      expect(resolveBookmarkConfig({ bookmarkIconSize: 22 }).iconSize).toBe('22px');
      expect(resolveBookmarkConfig({ bookmarkIconSize: '1.4em' }).iconSize).toBe('1.4em');
      expect(resolveBookmarkConfig({ bookmarkIconSize: 'url(x)' }).iconSize).toBeNull();
      expect(resolveBookmarkConfig({ bookmarkIconSize: -5 }).iconSize).toBeNull();
    });

    it('bookmarkIconSize is applied as a CSS variable on the editable', () => {
      target = document.createElement('div');
      document.body.appendChild(target);
      editor = new OpenEditor(target, { bookmarkIconSize: 20 });
      editor.plugins.install(createBookmarkPlugin());
      expect(editor.getEditorElement().style.getPropertyValue('--oe-bm-size')).toBe('20px');
    });

    it('panel button only appears with bookmarkPanel: true', () => {
      target = document.createElement('div');
      document.body.appendChild(target);
      editor = new OpenEditor(target, { bookmarkPanel: true });
      editor.plugins.install(createBookmarkPlugin());
      expect(target.querySelector('.oe-tb__btn[data-name="bookmarkPanel"]')).toBeTruthy();
      editor.destroy(); target.remove();
      // and NOT by default
      target = document.createElement('div');
      document.body.appendChild(target);
      editor = new OpenEditor(target, {});
      editor.plugins.install(createBookmarkPlugin());
      expect(target.querySelector('.oe-tb__btn[data-name="bookmarkPanel"]')).toBeNull();
    });
  });
});
