/**
 * 17.5.11 — ADVERSARIAL sweep of the allowlist-extension mechanism. Every
 * attempt to extend the sanitizer into dangerous territory must FAIL, with
 * legitimate extensions working. If any of these ever flips, the build stops.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { sanitize } from '../src/sanitizer/sanitizer.js';
import { OpenEditor } from '../src/editor.js';

const s = (html, opts = {}) => sanitize(html, { ...opts, document });

describe('17.5.11 — extension CANNOT weaken the deny-list', () => {
  it('allowTags:["script"] does not resurrect <script> (deny wins, warns)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = s('<p>x</p><script>alert(1)</script>', { allowTags: ['script'] });
    expect(out).not.toContain('script');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('deny-list always wins'));
    warn.mockRestore();
  });

  it('allowTags:["iframe","object","embed","form"] all stay dead', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const dirty = '<iframe src="https://evil.example"></iframe><object data="x"></object><embed src="x"><form action="x"><input></form>';
    const out = s(dirty, { allowTags: ['iframe', 'object', 'embed', 'form', 'input'] });
    for (const bad of ['<iframe', '<object', '<embed', '<form', '<input']) {
      expect(out).not.toContain(bad);
    }
    warn.mockRestore();
  });

  it('allowAttributes cannot enable event handlers (stripped before allowlist, warns)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = s('<p onclick="alert(1)" onmouseover="x()">hi</p>',
      { allowAttributes: { p: ['onclick', 'onmouseover'] } });
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('onmouseover');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('always stripped'));
    warn.mockRestore();
  });

  it('allowlisted URL-sink attrs are STILL scheme-checked on any tag', () => {
    const out = s('<p href="javascript:alert(1)">x</p>', { allowAttributes: { p: ['href'] } });
    expect(out).not.toContain('javascript:');
    const ok = s('<p href="https://example.com">x</p>', { allowAttributes: { p: ['href'] } });
    expect(ok).toContain('href="https://example.com"');
  });

  it('srcdoc can never be allowlisted', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = s('<p srcdoc="<script>x</script>">y</p>', { allowAttributes: { p: ['srcdoc'] } });
    expect(out).not.toContain('srcdoc');
    warn.mockRestore();
  });

  it('style values stay CSS-injection-checked even via extension', () => {
    const out = s('<custom-tag style="background:url(javascript:alert(1))">x</custom-tag>',
      { allowTags: ['custom-tag'], allowAttributes: { 'custom-tag': ['style'] } });
    expect(out).not.toContain('javascript:');
  });
});

describe('17.5.11 — legitimate extension works (the CMS-adoption path)', () => {
  it('a custom element with data attributes survives round-trip', () => {
    const out = s('<my-note data-kind="tip" class="x">note body</my-note>',
      { allowTags: ['my-note'], allowAttributes: { 'my-note': ['data-kind', 'class'] } });
    expect(out).toContain('<my-note data-kind="tip" class="x">note body</my-note>');
  });

  it('denyTags removes an otherwise-allowed default tag', () => {
    const out = s('<p>keep</p><mark>gone-wrapper</mark>', { denyTags: ['mark'] });
    expect(out).not.toContain('<mark>');
    expect(out).toContain('keep');
  });

  it('the whole path works THROUGH the editor config (not just sanitize())', () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    const editor = new OpenEditor(target, {
      allowTags: ['my-note'],
      allowAttributes: { 'my-note': ['data-kind'] },
    });
    editor.setHTML('<my-note data-kind="tip">hello</my-note><script>x</script>');
    const html = editor.getHTML();
    expect(html).toContain('<my-note data-kind="tip">hello</my-note>');
    expect(html).not.toContain('script');
    editor.destroy();
    target.remove();
  });
});

afterEach(() => {
  document.querySelectorAll('.oe-wrapper').forEach((n) => n.remove());
});
