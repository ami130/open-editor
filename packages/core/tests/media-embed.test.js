/**
 * media-embed.test.js — Phase 13.5: provider parsing + sanitizer iframe policy
 * + plugin. The sanitizer half is the security spine — tested hard.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';
import { parseMediaUrl, isAllowedEmbedSrc, EMBED_SANDBOX } from '../src/plugins/media/media-providers.js';
import { isSafeEmbedIframe } from '../src/sanitizer/sanitizer-config.js';
import { sanitize } from '../src/sanitizer/sanitizer.js';
import { createMediaPlugin, mediaPlugin } from '../src/plugins/media/media-plugin.js';
import { buildEmbed } from '../src/plugins/media/media-dom.js';

const s = (h) => sanitize(h, { document });
function iframe(html) { const d = document.createElement('div'); d.innerHTML = html; return d.firstChild; }

// ── provider parsing (pure) ─────────────────────────────────────────────────
describe('parseMediaUrl', () => {
  it('parses youtube watch/short/youtu.be into a nocookie embed', () => {
    expect(parseMediaUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ').src).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(parseMediaUrl('https://youtu.be/dQw4w9WgXcQ').src).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(parseMediaUrl('https://www.youtube.com/embed/dQw4w9WgXcQ').provider).toBe('youtube');
  });
  it('parses vimeo into a player embed', () => {
    expect(parseMediaUrl('https://vimeo.com/123456789').src).toBe('https://player.vimeo.com/video/123456789');
  });
  it('rejects non-https', () => {
    expect(parseMediaUrl('http://www.youtube.com/watch?v=abcdef')).toBeNull();
  });
  it('rejects unknown providers + junk', () => {
    expect(parseMediaUrl('https://evil.com/watch?v=x')).toBeNull();
    expect(parseMediaUrl('javascript:alert(1)')).toBeNull();
    expect(parseMediaUrl('not a url')).toBeNull();
    expect(parseMediaUrl('')).toBeNull();
  });
  it('isAllowedEmbedSrc only accepts https allowlisted hosts', () => {
    expect(isAllowedEmbedSrc('https://player.vimeo.com/video/1')).toBe(true);
    expect(isAllowedEmbedSrc('https://evil.com/x')).toBe(false);
    expect(isAllowedEmbedSrc('http://player.vimeo.com/video/1')).toBe(false);
  });
});

// ── sanitizer iframe policy (SECURITY SPINE) ────────────────────────────────
describe('isSafeEmbedIframe', () => {
  it('accepts an allowlisted https embed WITH a valid sandbox', () => {
    expect(isSafeEmbedIframe(iframe('<iframe src="https://player.vimeo.com/video/1" sandbox="allow-scripts allow-same-origin"></iframe>'))).toBe(true);
    expect(isSafeEmbedIframe(iframe('<iframe src="https://www.youtube-nocookie.com/embed/x" sandbox=""></iframe>'))).toBe(true);
  });
  it('rejects a missing sandbox', () => {
    expect(isSafeEmbedIframe(iframe('<iframe src="https://player.vimeo.com/video/1"></iframe>'))).toBe(false);
  });
  it('rejects an over-permissive sandbox token', () => {
    expect(isSafeEmbedIframe(iframe('<iframe src="https://player.vimeo.com/video/1" sandbox="allow-scripts allow-top-navigation"></iframe>'))).toBe(false);
    expect(isSafeEmbedIframe(iframe('<iframe src="https://player.vimeo.com/video/1" sandbox="allow-popups"></iframe>'))).toBe(false);
  });
  it('rejects a non-allowlisted host + non-https', () => {
    expect(isSafeEmbedIframe(iframe('<iframe src="https://evil.com/x" sandbox=""></iframe>'))).toBe(false);
    expect(isSafeEmbedIframe(iframe('<iframe src="http://player.vimeo.com/video/1" sandbox=""></iframe>'))).toBe(false);
  });
});

describe('sanitizer end-to-end iframe policy', () => {
  it('KEEPS a valid provider embed', () => {
    const out = s('<figure class="oe-embed"><iframe src="https://www.youtube-nocookie.com/embed/abc" sandbox="allow-scripts allow-same-origin"></iframe></figure>');
    expect(out).toMatch(/<iframe/);
    expect(out).toMatch(/youtube-nocookie\.com\/embed\/abc/);
  });
  it('REMOVES iframes that fail any check', () => {
    expect(s('<iframe src="https://www.youtube-nocookie.com/embed/x"></iframe>')).not.toMatch(/<iframe/); // no sandbox
    expect(s('<iframe src="https://evil.com/x" sandbox=""></iframe>')).not.toMatch(/<iframe/);            // evil host
    expect(s('<iframe src="javascript:alert(1)" sandbox=""></iframe>')).not.toMatch(/<iframe/);           // js url
    expect(s('<iframe src="https://player.vimeo.com/video/1" sandbox="allow-top-navigation"></iframe>')).not.toMatch(/<iframe/); // bad sandbox
  });
  it('STRIPS on* handlers and srcdoc from a valid embed', () => {
    const out = s('<iframe src="https://player.vimeo.com/video/1" sandbox="allow-scripts" onload="evil()" srcdoc="<script>x</script>"></iframe>');
    expect(out).toMatch(/<iframe/);
    expect(out).not.toMatch(/onload/i);
    expect(out).not.toMatch(/srcdoc/i);
  });
  it('EMPTIES a kept embed iframe (RAWTEXT-child hardening)', () => {
    const out = s('<iframe src="https://player.vimeo.com/video/1" sandbox="allow-scripts"><script>alert(1)</script>x</iframe>');
    expect(out).toMatch(/<iframe[^>]*><\/iframe>/); // kept but empty
    // no <script> tag and no leaked content survives (note: "allow-scripts" in
    // the sandbox value legitimately contains the substring "script", so match
    // the TAG and the payload, not the bare word)
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/alert\(1\)/);
    expect(out).not.toMatch(/>x</); // the trailing "x" child is gone
  });
});

// ── plugin ───────────────────────────────────────────────────────────────────
let editor;
beforeEach(() => { editor = createTestEditor(); });
afterEach(() => {
  if (!editor.isDestroyed()) editor.destroy();
  if (editor._target && editor._target.parentNode) editor._target.remove();
});

describe('media plugin', () => {
  it('exposes contract + singleton', () => {
    const p = createMediaPlugin();
    expect(p.name).toBe('media');
    expect(mediaPlugin.name).toBe('media');
  });
  it('builds a sandboxed embed figure for a valid spec', () => {
    const fig = buildEmbed(editor, { provider: 'vimeo', src: 'https://player.vimeo.com/video/1' });
    expect(fig.tagName).toBe('FIGURE');
    const frame = fig.querySelector('iframe');
    expect(frame.getAttribute('sandbox')).toBe(EMBED_SANDBOX);
    expect(frame.getAttribute('src')).toBe('https://player.vimeo.com/video/1');
    // the built embed passes the sanitizer's own check
    expect(isSafeEmbedIframe(frame)).toBe(true);
  });
  it('installs/uninstalls cleanly', () => {
    editor.plugins.install(createMediaPlugin());
    expect(editor.plugins._installed.has('media')).toBe(true);
    expect(() => editor.plugins.uninstall('media')).not.toThrow();
  });
});
