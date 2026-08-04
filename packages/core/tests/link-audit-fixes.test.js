/**
 * link-audit-fixes.test.js — regressions for the link deep-audit round.
 *   L1 sanitizer validates <a href> with the strict link allowlist (paste policy)
 *   L4 normalizeUserHref prepends https:// to bare domains (not to relative files)
 *   L5 applyLinkAttrs heals an existing dangerous href on edit
 */
import { describe, it, expect } from 'vitest';
import { sanitize } from '../src/sanitizer/sanitizer.js';
import { normalizeUserHref } from '../src/plugins/link/link-url.js';
import { applyLinkAttrs } from '../src/plugins/link/link-dom.js';

describe('L1 pasted <a href> obeys the strict link allowlist', () => {
  const blocked = ['ms-msdt:x', 'intent://x', 'jar:http://x', 'about:blank',
    'file:///etc/passwd', 'ftp://h/x', 'vscode://x', 'javascript:alert(1)'];
  for (const s of blocked) {
    it(`strips href="${s}" on paste/sanitize`, () => {
      expect(sanitize(`<a href="${s}">t</a>`, {})).not.toContain('href');
    });
  }
  const kept = ['https://x.com/p', 'http://x.com', 'mailto:a@b.com', 'tel:+1', '#top', '/page', 'page.html'];
  for (const s of kept) {
    it(`keeps href="${s}"`, () => {
      expect(sanitize(`<a href="${s}">t</a>`, {})).toContain('href');
    });
  }
  it('blocks a data:text/html link EVEN with imageAllowDataUri (decoupled)', () => {
    expect(sanitize('<a href="data:text/html,<b>x</b>">t</a>', { allowDataUris: true })).not.toContain('href');
  });
  it('does not affect <img src> data-URI policy', () => {
    expect(sanitize('<img src="data:image/png;base64,AAAA">', { allowDataUris: true })).toContain('src=');
  });
});

describe('L4 normalizeUserHref', () => {
  it('prepends https:// to a bare domain', () => {
    expect(normalizeUserHref('example.com')).toBe('https://example.com');
    expect(normalizeUserHref('www.foo.co.uk/p?a=1#h')).toBe('https://www.foo.co.uk/p?a=1#h');
  });
  it('leaves schemes/anchors/paths/mailto untouched', () => {
    for (const s of ['https://x.com', 'mailto:a@b', 'tel:+1', '#a', '/p', './r', '../u']) {
      expect(normalizeUserHref(s)).toBe(s);
    }
  });
  it('does NOT prepend to a path-less relative file', () => {
    for (const s of ['page.html', 'script.js', 'my.file.pdf', 'data.json']) {
      expect(normalizeUserHref(s)).toBe(s);
    }
  });
});

describe('L5 applyLinkAttrs heals an existing bad href on edit', () => {
  it('strips a pre-existing dangerous href when no valid new href is set', () => {
    const a = document.createElement('a');
    a.setAttribute('href', 'javascript:alert(1)');
    a.textContent = 'x';
    applyLinkAttrs(a, { title: 'edited' }); // edit metadata, no href change
    expect(a.hasAttribute('href')).toBe(false);
  });
  it('keeps a safe existing href untouched', () => {
    const a = document.createElement('a');
    a.setAttribute('href', 'https://x.com');
    applyLinkAttrs(a, { title: 't' });
    expect(a.getAttribute('href')).toBe('https://x.com');
  });
});
