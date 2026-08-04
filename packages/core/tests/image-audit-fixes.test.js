/**
 * image-audit-fixes.test.js — regression tests for the deep-audit round:
 *   #1 oe-figure--selected stripped from getHTML output
 *   #2 resize anchor never writes margin-left for center/right/inline (no de-center)
 *   #4 Properties preserves the resize margin-left across a cssText apply + clamps size
 *   #5 data:image/svg+xml (and non-image data:) blocked by the image src subtype gate
 */
import { describe, it, expect } from 'vitest';
import { normalizeOutputHTML } from '../src/utils/html-normalize.js';
import { commitAnchor } from '../src/plugins/image/image-resize-anchor.js';
import { applyImageProps } from '../src/plugins/image/image-properties.js';
import { sanitizeSrc, sanitizeSrcset } from '../src/plugins/image/image-url.js';
import { MAX_WIDTH } from '../src/plugins/image/image-resize-compute.js';

// ── #1: selection class stripped on serialize ────────────────────────────────
describe('#1 getHTML strips oe-figure--selected (but keeps alignment classes)', () => {
  it('removes oe-figure--selected from a serialized figure', () => {
    const html = '<figure class="oe-figure oe-figure--selected" data-oe-island="image"><img src="x.png"></figure>';
    const out = normalizeOutputHTML(html, document);
    expect(out).not.toContain('oe-figure--selected');
    expect(out).toContain('oe-figure'); // the base + island stay
  });
  it('keeps content alignment classes (center/left/right)', () => {
    const html = '<figure class="oe-figure oe-figure--center oe-figure--selected"><img src="x.png"></figure>';
    const out = normalizeOutputHTML(html, document);
    expect(out).toContain('oe-figure--center');
    expect(out).not.toContain('oe-figure--selected');
  });
});

// ── #2: anchor never de-centers a center/right/inline image ───────────────────
describe('#2 commitAnchor leaves margin-left alone when layout owns placement', () => {
  function img() { return document.createElement('img'); }

  it('writes NO margin-left when maxLeftGrow is 0 (centered), even on shrink', () => {
    const el = img();
    // Shrink (finalW < startW) with a computed auto-ish startMarginLeft, no room.
    commitAnchor(el, { anchorX: true, startW: 200, startMarginLeft: 300, maxLeftGrow: 0 }, 120);
    expect(el.style.marginLeft).toBe('');
  });

  it('still anchors (writes margin-left) when there IS left room', () => {
    const el = img();
    // startMargin 100, grew 40 into room → 100-40 = 60.
    commitAnchor(el, { anchorX: true, startW: 100, startMarginLeft: 100, maxLeftGrow: 500 }, 140);
    expect(el.style.marginLeft).toBe('60px');
  });
});

// ── #4: Properties preserves resize margin-left + clamps size ─────────────────
describe('#4 applyImageProps preserves the resize anchor margin + clamps dims', () => {
  function figWithImg(styleText) {
    const fig = document.createElement('figure');
    const im = document.createElement('img');
    if (styleText) im.style.cssText = styleText;
    fig.appendChild(im);
    return { fig, im };
  }

  it('keeps a prior margin-left when the free-text style box is applied and no margin set in form', () => {
    const { fig, im } = figWithImg('margin-left: 80px;');
    applyImageProps(fig, { style: 'box-shadow: 0 0 4px #000;' }, {});
    expect(im.style.marginLeft).toBe('80px');       // survived the cssText wipe
    expect(im.style.boxShadow).not.toBe('');        // author style applied too
  });

  it('lets an explicit form margin.left override the preserved value', () => {
    const { fig, im } = figWithImg('margin-left: 80px;');
    applyImageProps(fig, { style: '', margins: { left: '10' } }, {});
    expect(im.style.marginLeft).toBe('10px');
  });

  it('clamps an absurd typed width to MAX_WIDTH', () => {
    const { fig, im } = figWithImg('');
    applyImageProps(fig, { width: '999999' }, {});
    expect(parseInt(im.style.width, 10)).toBe(MAX_WIDTH);
  });

  it('clamps width:0 up to the minimum (never serializes 0)', () => {
    const { fig, im } = figWithImg('');
    applyImageProps(fig, { width: '0' }, {});
    expect(parseInt(im.style.width, 10)).toBeGreaterThan(0);
  });
});

// ── #5: data: subtype gate ────────────────────────────────────────────────────
describe('#5 image src blocks data:image/svg+xml and non-image data:', () => {
  const cfg = { imageAllowDataUri: true };

  it('blocks data:image/svg+xml even when data URIs are enabled', () => {
    expect(sanitizeSrc('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', cfg)).toBeNull();
  });
  it('blocks a non-image data: URI (data:text/html)', () => {
    expect(sanitizeSrc('data:text/html;base64,PGgxPjwvaDE+', cfg)).toBeNull();
  });
  it('allows a raster PNG data URI', () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==';
    expect(sanitizeSrc(png, cfg)).toBe(png);
  });
  it('blocks ALL data URIs (incl. png) when imageAllowDataUri is off', () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==';
    expect(sanitizeSrc(png, {})).toBeNull();
  });
  it('drops a srcset containing an svg data candidate', () => {
    const ss = 'https://x.com/a.png 1x, data:image/svg+xml;base64,PHN2Zz4= 2x';
    expect(sanitizeSrcset(ss, cfg)).toBeNull();
  });
});

// ── #10: 0-byte reject + table-cell insert ───────────────────────────────────
import { fileSizeError, serverErrorDetail } from '../src/plugins/image/image-upload.js';
import { insertFigure } from '../src/plugins/image/image-dom-insert.js';
import { createFigure } from '../src/plugins/image/image-dom.js';
import { createTestEditor } from '../src/testing/test-harness.js';

describe('#10 0-byte files rejected', () => {
  it('returns an error for a 0-byte file', () => {
    expect(fileSizeError({ size: 0, type: 'image/png' }, {})).toMatch(/empty/i);
  });
  it('allows a normal-sized file', () => {
    expect(fileSizeError({ size: 1024, type: 'image/png' }, {})).toBeNull();
  });
});

describe('#10 insert into a table cell (figure stays inside the cell)', () => {
  it('inserts the figure inside the <td>, not outside the table', () => {
    const editor = createTestEditor();
    const root = editor.getEditorElement();
    root.innerHTML = '<table><tbody><tr><td><p>cell</p></td></tr></tbody></table>';
    const td = root.querySelector('td');
    const p = td.querySelector('p');
    // Put the caret inside the cell's paragraph.
    const range = document.createRange();
    range.setStart(p.firstChild, 2); range.collapse(true);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);

    const fig = createFigure('https://x.com/a.png', {}, {}, document);
    insertFigure(editor, fig);

    expect(td.querySelector('figure[data-oe-island]')).not.toBeNull();      // inside the cell
    expect(root.querySelector('table').contains(fig)).toBe(true);            // still in the table
    if (!editor.isDestroyed()) editor.destroy();
  });
});

// ── #9: server error body surfaced ────────────────────────────────────────────
describe('#9 serverErrorDetail extracts a human message', () => {
  it('reads a JSON {error} field', () => {
    expect(serverErrorDetail({ status: 413, responseText: '{"error":"file too large"}' }))
      .toMatch(/file too large.*413/i);
  });
  it('reads a plain-text body', () => {
    expect(serverErrorDetail({ status: 500, responseText: 'boom' })).toMatch(/boom.*500/i);
  });
  it('ignores an HTML error page, falling back to the status', () => {
    expect(serverErrorDetail({ status: 502, responseText: '<html><body>Bad Gateway</body></html>' }))
      .toBe('HTTP 502');
  });
});
