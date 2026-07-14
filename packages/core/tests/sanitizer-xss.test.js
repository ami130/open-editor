import { describe, it, expect } from 'vitest';
import { sanitize } from '../src/sanitizer/sanitizer.js';

// Helper: sanitize with jsdom's document
function s(html, opts = {}) {
  return sanitize(html, { ...opts, document });
}

// ─── 2.7 — Strip <script> and on* event attributes ───────────────────────────

describe('2.7 — strip script tags and on* attributes', () => {
  it('removes <script> tags entirely (including contents)', () => {
    const out = s('<p>Hello</p><script>alert(1)</script>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('alert(1)');
    expect(out).toContain('Hello');
  });

  it('removes inline <script> with src', () => {
    const out = s('<script src="evil.js"></script><p>safe</p>');
    expect(out).not.toContain('<script');
    expect(out).toContain('safe');
  });

  it('strips onclick attribute', () => {
    const out = s('<p onclick="alert(1)">text</p>');
    expect(out).not.toContain('onclick');
    expect(out).toContain('text');
  });

  it('strips onmouseover attribute', () => {
    const out = s('<a href="#" onmouseover="evil()">link</a>');
    expect(out).not.toContain('onmouseover');
  });

  it('strips onerror attribute', () => {
    const out = s('<img src="x" onerror="alert(1)">');
    expect(out).not.toContain('onerror');
  });

  it('strips onfocus attribute', () => {
    const out = s('<input onfocus="evil()">');
    expect(out).not.toContain('onfocus');
  });

  it('strips uppercase ON* attributes (case-insensitive)', () => {
    const out = s('<p ONCLICK="evil()">text</p>');
    expect(out).not.toContain('ONCLICK');
    expect(out).not.toContain('onclick');
  });

  it('strips <noscript> tags', () => {
    const out = s('<noscript><p>noscript content</p></noscript>');
    expect(out).not.toContain('noscript');
  });
});

// ─── 2.8 — Block javascript: in href/src ─────────────────────────────────────

describe('2.8 — block javascript: scheme', () => {
  it('strips javascript: from href', () => {
    const out = s('<a href="javascript:alert(1)">click</a>');
    expect(out).not.toContain('javascript:');
  });

  it('strips javascript: from src', () => {
    const out = s('<img src="javascript:alert(1)">');
    expect(out).not.toContain('javascript:');
  });

  it('strips javascript: with leading whitespace', () => {
    const out = s('<a href="  javascript:alert(1)">x</a>');
    expect(out).not.toContain('javascript:');
  });

  it('strips javascript: with embedded newline', () => {
    const out = s('<a href="java\nscript:alert(1)">x</a>');
    expect(out).not.toContain('javascript:');
  });

  it('strips javascript: with embedded tab', () => {
    const out = s('<a href="java\tscript:alert(1)">x</a>');
    expect(out).not.toContain('javascript:');
  });

  it('strips javascript: in uppercase', () => {
    const out = s('<a href="JAVASCRIPT:alert(1)">x</a>');
    expect(out).not.toContain('javascript:');
    expect(out).not.toContain('JAVASCRIPT:');
  });

  it('allows safe https:// href', () => {
    const out = s('<a href="https://example.com">link</a>');
    expect(out).toContain('href="https://example.com"');
  });

  it('allows relative href', () => {
    const out = s('<a href="/page">link</a>');
    expect(out).toContain('href="/page"');
  });
});

// ─── 2.9 — Block data: URIs ───────────────────────────────────────────────────

describe('2.9 — block data: URIs', () => {
  it('strips data: from href', () => {
    const out = s('<a href="data:text/html,<script>alert(1)</script>">x</a>');
    expect(out).not.toContain('data:');
  });

  it('strips data: from src', () => {
    const out = s('<img src="data:image/png;base64,abc">');
    expect(out).not.toContain('data:');
  });

  it('strips data: with mixed case', () => {
    const out = s('<a href="Data:text/html,evil">x</a>');
    expect(out).not.toContain('data:');
    expect(out).not.toContain('Data:');
  });

  // M1 fix — srcset carries URLs but was never scheme-checked.
  it('strips srcset when a candidate uses data:', () => {
    const out = s('<img src="https://x/a.png" srcset="data:text/html,zzz 1x">');
    expect(out).not.toContain('data:');
  });
  it('strips srcset when a candidate uses javascript:', () => {
    const out = s('<img src="https://x/a.png" srcset="javascript:alert(1) 2x">');
    expect(out).not.toContain('javascript:');
  });
  it('keeps a safe multi-candidate srcset', () => {
    const out = s('<img src="https://x/a.png" srcset="https://x/a.png 1x, https://x/b.png 2x">');
    expect(out).toContain('srcset');
    expect(out).toContain('https://x/b.png');
  });
});

// ─── 2.10 — Block CSS injection in style attribute ───────────────────────────

describe('2.10 — block CSS injection via style attribute', () => {
  it('strips style containing url()', () => {
    const out = s('<p style="background:url(evil.png)">text</p>');
    expect(out).not.toContain('url(');
  });

  it('strips style containing expression()', () => {
    const out = s('<p style="width:expression(alert(1))">text</p>');
    expect(out).not.toContain('expression(');
  });

  it('strips style containing javascript:', () => {
    const out = s('<p style="behavior:javascript:evil">text</p>');
    expect(out).not.toContain('javascript:');
  });

  it('strips style containing behavior:', () => {
    const out = s('<p style="behavior:url(evil.htc)">text</p>');
    expect(out).not.toContain('behavior:');
  });

  it('allows safe style attribute', () => {
    const out = s('<p style="color:red;font-size:14px">text</p>');
    expect(out).toContain('style=');
  });

  // C1 fix — CSS escapes are DECODED (not deleted) before matching, so a
  // browser-reconstructable payload like "\75rl(" (→ "url(") is caught.
  it('strips style with escaped url(): \\75rl()', () => {
    const out = s('<p style="background:\\75rl(//evil.com/x)">t</p>');
    expect(out).not.toContain('evil.com');
    expect(out).not.toContain('75rl');
  });
  it('strips style with escaped expression(): \\65 xpression()', () => {
    const out = s('<p style="width:\\65 xpression(alert(1))">t</p>');
    expect(out).not.toContain('xpression');
    expect(out).not.toContain('alert');
  });
  it('strips style with escaped parentheses in url', () => {
    const out = s('<p style="background:url\\28//evil.com\\29">t</p>');
    expect(out).not.toContain('evil.com');
  });
  it('still allows legit styles with escapes (font names, content)', () => {
    const out = s('<p style="content:\\2013;color:#e11d48">t</p>');
    // Not flagged unsafe — style survives.
    expect(out).toContain('style=');
    expect(out).toContain('#e11d48');
  });
});

// ─── 2.11 — Per-tag attribute whitelist ──────────────────────────────────────

describe('2.11 — per-tag attribute whitelist', () => {
  it('strips unknown attributes from <p>', () => {
    const out = s('<p data-evil="x" class="ok">text</p>');
    expect(out).not.toContain('data-evil');
    expect(out).toContain('class="ok"');
  });

  it('strips unknown attributes from <a>', () => {
    const out = s('<a href="/x" download="file">link</a>');
    expect(out).not.toContain('download');
    expect(out).toContain('href=');
  });

  it('strips unknown attributes from <img>', () => {
    const out = s('<img src="x.png" crossorigin="anonymous">');
    expect(out).not.toContain('crossorigin');
    expect(out).toContain('src=');
  });

  // 9.2 — id is allowed on <img> (Image Properties Advanced tab).
  it('allows id + class + style on <img>', () => {
    const out = s('<img src="x.png" id="hero" class="rounded" style="border-radius:8px">');
    expect(out).toContain('id="hero"');
    expect(out).toContain('class="rounded"');
    expect(out).toContain('border-radius');
  });

  it('allows allowed attributes on <a>', () => {
    const out = s('<a href="/x" title="t" rel="noopener" target="_blank">link</a>');
    expect(out).toContain('href=');
    expect(out).toContain('title=');
    expect(out).toContain('rel=');
  });

  it('keeps allowed heading attributes', () => {
    const out = s('<h2 id="section-1" class="title">Title</h2>');
    expect(out).toContain('id="section-1"');
    expect(out).toContain('class="title"');
  });

  // 11.A — table caption / colgroup / col are now allowed (were stripped before).
  it('preserves <caption>, <colgroup> and <col> in a table', () => {
    const html =
      '<table><caption>Sales</caption>' +
      '<colgroup><col span="1" style="width:40%"><col style="width:60%"></colgroup>' +
      '<tbody><tr><td colspan="2">x</td></tr></tbody></table>';
    const out = s(html);
    expect(out).toContain('<caption>Sales</caption>');
    expect(out).toContain('<colgroup>');
    expect(out).toContain('<col');
    expect(out).toContain('width:40%');
    expect(out).toContain('colspan="2"');
  });
  it('still strips a dangerous style on <col>', () => {
    const out = s('<table><colgroup><col style="width:expression(alert(1))"></colgroup><tr><td>x</td></tr></table>');
    expect(out).not.toContain('expression');
  });
  it('still strips an event handler off <caption>', () => {
    const out = s('<table><caption onclick="alert(1)">c</caption><tr><td>x</td></tr></table>');
    expect(out).not.toContain('onclick');
  });

  it('strips disallowed tag entirely but keeps text content', () => {
    const out = s('<marquee>scrolling</marquee>');
    expect(out).not.toContain('<marquee');
    expect(out).toContain('scrolling');
  });
});

// ─── 2.12 — Custom sanitizer rules API ───────────────────────────────────────

describe('2.12 — custom sanitizer rules', () => {
  it('allowTags adds a new allowed tag', () => {
    const out = s('<details><summary>Title</summary><p>body</p></details>', {
      allowTags: ['details', 'summary'],
    });
    expect(out).toContain('<details');
    expect(out).toContain('<summary');
  });

  it('denyTags blocks an otherwise-allowed tag', () => {
    const out = s('<p>hello</p><table><tr><td>cell</td></tr></table>', {
      denyTags: ['table', 'tr', 'td'],
    });
    expect(out).not.toContain('<table');
    expect(out).toContain('<p>hello</p>');
  });

  it('allowAttributes adds extra attrs for a tag', () => {
    const out = s('<span data-custom="yes">text</span>', {
      allowAttributes: { span: ['data-custom'] },
    });
    expect(out).toContain('data-custom="yes"');
  });

  it('custom denyTags strips children too', () => {
    const out = s('<div class="x"><p>keep</p><script>evil()</script></div>', {
      denyTags: ['script'],
    });
    expect(out).not.toContain('evil()');
    expect(out).toContain('keep');
  });
});

// ─── 2.23 — Strip <base> tag ─────────────────────────────────────────────────

describe('2.23 — strip <base> tag', () => {
  it('removes <base href> from pasted content', () => {
    const out = s('<base href="https://evil.com"><p>text</p>');
    expect(out).not.toContain('<base');
    expect(out).toContain('text');
  });
});

// ─── 2.24 — Strip inline <svg> ───────────────────────────────────────────────

describe('2.24 — strip inline SVG', () => {
  it('removes inline <svg> entirely', () => {
    const out = s('<p>before</p><svg><script>alert(1)</script></svg><p>after</p>');
    expect(out).not.toContain('<svg');
    expect(out).not.toContain('alert(1)');
    expect(out).toContain('before');
    expect(out).toContain('after');
  });

  it('removes SVG with xlink:href injection', () => {
    const out = s('<svg><use xlink:href="javascript:alert(1)"/></svg>');
    expect(out).not.toContain('svg');
    expect(out).not.toContain('javascript:');
  });
});

// ─── 2.25 — mXSS double-parse defense ────────────────────────────────────────

describe('2.25 — mXSS double-parse defense', () => {
  it('strips HTML comments that could mask injections', () => {
    const out = s('<p><!-- <script>alert(1)</script> -->text</p>');
    expect(out).not.toContain('<!--');
    expect(out).not.toContain('alert(1)');
    expect(out).toContain('text');
  });

  it('survives repeated sanitization (idempotent)', () => {
    const input = '<p>Hello <strong>world</strong></p>';
    const once = s(input);
    const twice = s(once);
    expect(twice).toBe(once);
  });
});

// ─── 2.18 — Content structural normalization ─────────────────────────────────
