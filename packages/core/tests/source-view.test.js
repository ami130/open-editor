/**
 * source-view.test.js — Phase 13.1b/c: the source-view toggle + the SECURITY
 * round-trip (malicious HTML typed in source mode must be sanitized on exit).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';
import { createSourcePlugin, sourcePlugin } from '../src/plugins/source/source-plugin.js';

let editor;
beforeEach(() => { editor = createTestEditor(); });
afterEach(() => {
  if (!editor.isDestroyed()) editor.destroy();
  if (editor._target && editor._target.parentNode) editor._target.remove();
});

const ta = () => editor._wrapper.querySelector('.oe-source__textarea');

describe('source plugin — contract & toggle', () => {
  it('exposes contract + singleton', () => {
    const p = createSourcePlugin();
    expect(p.name).toBe('source');
    expect(sourcePlugin.name).toBe('source');
  });

  it('entering source shows a textarea with the (beautified) HTML', () => {
    const p = createSourcePlugin(); p.install(editor);
    editor.getEditorElement().innerHTML = '<div><p>hi</p></div>';
    p.toggle();
    expect(p._active).toBe(true);
    const t = ta();
    expect(t).not.toBeNull();
    expect(t.value).toMatch(/<p>/);
    // WYSIWYG surface is hidden while in source mode
    expect(editor.getEditorElement().style.display).toBe('none');
    expect(p.getToolbarButtons()[0].isActive()).toBe(true);
  });

  it('exiting source restores the editable area and applies the content', () => {
    const p = createSourcePlugin(); p.install(editor);
    editor.getEditorElement().innerHTML = '<p>original</p>';
    p.toggle();                 // enter
    ta().value = '<p>edited in source</p>';
    p.toggle();                 // exit
    expect(p._active).toBe(false);
    expect(ta()).toBeNull();    // textarea gone
    expect(editor.getEditorElement().style.display).toBe(''); // restored
    expect(editor.getEditorElement().innerHTML).toMatch(/edited in source/);
  });

  it('round-trips clean content without loss', () => {
    const p = createSourcePlugin(); p.install(editor);
    editor.setHTML('<p>hello <strong>world</strong></p>');
    p.toggle(); p.toggle(); // enter then exit unchanged
    expect(editor.getHTML()).toMatch(/<strong>world<\/strong>/);
  });

  it('a source edit is UNDOABLE (audit#5: history not cleared on exit)', () => {
    const p = createSourcePlugin(); p.install(editor);
    editor.setHTML('<p>original</p>');
    p.toggle(); ta().value = '<p>edited</p>'; p.toggle();
    expect(editor.getEditorElement().textContent).toContain('edited');
    editor.undo();
    expect(editor.getEditorElement().textContent).toContain('original');
  });

  it('external setHTML while source is open + no edit → external content is NOT clobbered (audit#5)', () => {
    const p = createSourcePlugin(); p.install(editor);
    editor.setHTML('<p>first</p>');
    p.toggle();                               // enter (textarea = "first")
    editor.setHTML('<p>EXTERNAL</p>');        // host mutates; user does NOT edit source
    p.toggle();                               // exit — must not write stale "first"
    expect(editor.getEditorElement().textContent).toContain('EXTERNAL');
  });

  it('round-trips a <pre> code block WITHOUT corrupting its whitespace (verifier regression)', () => {
    const p = createSourcePlugin(); p.install(editor);
    editor.setHTML('<pre><code>if (a &lt; b) {\n  run();\n}</code></pre>');
    const codeBefore = editor.getEditorElement().querySelector('pre').textContent;
    p.toggle(); p.toggle(); // enter then exit, no edit
    const codeAfter = editor.getEditorElement().querySelector('pre').textContent;
    expect(codeAfter).toBe(codeBefore);
  });

  it('empty editor round-trips to a valid (empty) state', () => {
    const p = createSourcePlugin(); p.install(editor);
    editor.setHTML('');
    p.toggle();
    expect(ta().value).toBe('');
    p.toggle();
    expect(() => editor.getHTML()).not.toThrow();
  });
});

describe('source plugin — SECURITY (round-trip sanitizes)', () => {
  function typeInSourceAndExit(malicious) {
    const p = createSourcePlugin(); p.install(editor);
    editor.setHTML('<p>safe</p>');
    p.toggle();                 // enter source
    ta().value = malicious;     // user types malicious HTML in the textarea
    p.toggle();                 // exit → setHTML sanitizes
    return editor.getEditorElement().innerHTML;
  }

  it('strips a <script> typed in source mode', () => {
    const html = typeInSourceAndExit('<p>x</p><script>window.__xss=1</script>');
    expect(html).not.toMatch(/<script/i);
    expect(html).toMatch(/x/);
  });

  it('strips an onerror handler typed in source mode', () => {
    const html = typeInSourceAndExit('<p>ok<img src=x onerror="alert(1)"></p>');
    expect(html).not.toMatch(/onerror/i);
  });

  it('strips a javascript: link typed in source mode', () => {
    const html = typeInSourceAndExit('<a href="javascript:alert(1)">click</a>');
    expect(html).not.toMatch(/javascript:/i);
  });

  it('strips an UNSAFE iframe typed in source mode (no sandbox / evil host)', () => {
    expect(typeInSourceAndExit('<iframe src="https://evil.com/x"></iframe>')).not.toMatch(/<iframe/i);
    expect(typeInSourceAndExit('<iframe src="https://www.youtube-nocookie.com/embed/x"></iframe>')).not.toMatch(/<iframe/i); // no sandbox
  });

  it('KEEPS a valid provider embed typed in source mode', () => {
    const html = typeInSourceAndExit('<figure class="oe-embed"><iframe src="https://player.vimeo.com/video/1" sandbox="allow-scripts allow-same-origin"></iframe></figure>');
    expect(html).toMatch(/<iframe/);
    expect(html).toMatch(/player\.vimeo\.com/);
  });

  it('the getHTML output after a malicious round-trip is clean', () => {
    const p = createSourcePlugin(); p.install(editor);
    editor.setHTML('<p>a</p>');
    p.toggle();
    ta().value = '<p>b</p><script>evil()</script><img src=x onerror=e()>';
    p.toggle();
    const out = editor.getHTML();
    expect(out).not.toMatch(/<script|onerror|evil/i);
    expect(out).toMatch(/b/);
  });
});

describe('source plugin — lifecycle safety', () => {
  it('destroy() while in source mode restores the editable area (no stuck-hidden editor)', () => {
    const p = createSourcePlugin(); p.install(editor);
    editor.getEditorElement().innerHTML = '<p>x</p>';
    p.toggle(); // enter source
    expect(editor.getEditorElement().style.display).toBe('none');
    p.destroy();
    expect(editor.getEditorElement().style.display).toBe(''); // restored
  });

  it('installs/uninstalls cleanly via PluginManager', () => {
    editor.plugins.install(createSourcePlugin());
    expect(editor.plugins._installed.has('source')).toBe(true);
    expect(() => editor.plugins.uninstall('source')).not.toThrow();
  });

  it('double-toggle returns to WYSIWYG cleanly', () => {
    const p = createSourcePlugin(); p.install(editor);
    editor.setHTML('<p>x</p>');
    p.toggle(); p.toggle(); p.toggle(); p.toggle();
    expect(p._active).toBe(false);
    expect(ta()).toBeNull();
  });
});
