/**
 * Phase 9 — Image Plugin core unit tests.
 * Covers: 9.2, 9.7, 9.8, 9.9, 9.11, 9.12, 9.13, 9.14, 9.16, 9.18
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';
import { imagePlugin }      from '../src/plugins/image/image-plugin.js';
import {
  createFigure, sanitizeSrc, sanitizeSrcset, applyAlignment, insertFigure, wrapInLink,
} from '../src/plugins/image/image-dom.js';
import { ImageResizeManager } from '../src/plugins/image/image-resize.js';
import { sanitize } from '../src/sanitizer/sanitizer.js';

// ── Helper: fresh plugin spec clone per test (plugin stores state on itself) ──
function makePlugin() {
  return Object.assign(Object.create(null), imagePlugin, {
    _editor: null, _selection: null, _resize: null, _nativeHandlers: null,
  });
}

let editor;

beforeEach(() => { editor = createTestEditor(); });
afterEach(() => {
  if (!editor.isDestroyed()) editor.destroy();
  if (editor._target && editor._target.parentNode) editor._target.remove();
});

// ── 9.12 — src sanitization ───────────────────────────────────────────────────

describe('9.12 — sanitizeSrc', () => {
  it('allows a normal https URL', () => {
    expect(sanitizeSrc('https://example.com/img.jpg')).toBe('https://example.com/img.jpg');
  });

  it('blocks javascript: scheme always', () => {
    expect(sanitizeSrc('javascript:alert(1)')).toBeNull();
    expect(sanitizeSrc('JAVASCRIPT:alert(1)')).toBeNull();
  });

  it('blocks vbscript: scheme always', () => {
    expect(sanitizeSrc('vbscript:evil')).toBeNull();
  });

  it('blocks data: URI by default', () => {
    expect(sanitizeSrc('data:image/png;base64,abc')).toBeNull();
  });

  it('allows data: URI when imageAllowDataUri is true', () => {
    const src = 'data:image/png;base64,abc';
    expect(sanitizeSrc(src, { imageAllowDataUri: true })).toBe(src);
  });

  it('returns null for empty / non-string input', () => {
    expect(sanitizeSrc('')).toBeNull();
    expect(sanitizeSrc(null)).toBeNull();
    expect(sanitizeSrc(undefined)).toBeNull();
  });

  // Hardening: aligned with the central isUnsafeUrl (blob:/filesystem: too).
  it('blocks blob: and filesystem: schemes', () => {
    expect(sanitizeSrc('blob:https://x/abc')).toBeNull();
    expect(sanitizeSrc('filesystem:https://x/abc')).toBeNull();
  });
});

describe('9.12 — sanitizeSrcset (srcset candidate scheme check)', () => {
  it('keeps a srcset whose candidates are all safe URLs', () => {
    const ss = 'https://x/a.jpg 1x, https://x/b.jpg 2x';
    expect(sanitizeSrcset(ss)).toBe(ss);
  });
  it('drops the whole srcset if ANY candidate is unsafe', () => {
    expect(sanitizeSrcset('https://x/a.jpg 1x, javascript:alert(1) 2x')).toBeNull();
    expect(sanitizeSrcset('data:image/png;base64,abc 1x')).toBeNull();
  });
  it('createFigure omits an unsafe srcset but still builds the figure', () => {
    const fig = createFigure('https://x/a.jpg', { srcset: 'javascript:alert(1) 1x' });
    expect(fig).not.toBeNull();
    expect(fig.querySelector('img').hasAttribute('srcset')).toBe(false);
  });
});

// ── 16.7.8 — responsive <picture> output ─────────────────────────────────────

describe('16.7.8 — createFigure responsive <picture>', () => {
  const SRC = 'https://x.com/a.jpg';

  it('wraps <img> in <picture> when opts.sources is non-empty', () => {
    const fig = createFigure(SRC, {
      sources: [
        { srcset: 'https://x.com/a-1x.jpg 1x, https://x.com/a-2x.jpg 2x', media: '(min-width: 800px)' },
        { srcset: 'https://x.com/a-sm.jpg', type: 'image/webp' },
      ],
    }, {}, document);
    const pic = fig.querySelector('picture');
    expect(pic).not.toBeNull();
    const sources = pic.querySelectorAll('source');
    expect(sources.length).toBe(2);
    // <img> stays as the last child of <picture> (the required fallback).
    expect(pic.lastElementChild.tagName.toLowerCase()).toBe('img');
    expect(sources[0].getAttribute('media')).toBe('(min-width: 800px)');
    expect(sources[1].getAttribute('type')).toBe('image/webp');
  });

  it('does NOT wrap in <picture> when sources is absent', () => {
    const fig = createFigure(SRC, {}, {}, document);
    expect(fig.querySelector('picture')).toBeNull();
    expect(fig.querySelector('img')).not.toBeNull();
  });

  it('drops a <source> whose srcset is entirely unsafe, keeping only safe ones', () => {
    const fig = createFigure(SRC, {
      sources: [
        { srcset: 'javascript:alert(1) 1x' },              // dropped
        { srcset: 'https://x.com/ok.jpg 1x' },             // kept
        { srcset: 'https://x.com/a.jpg 1x, data:foo 2x' }, // dropped (any unsafe → whole srcset null)
      ],
    }, {}, document);
    const sources = fig.querySelectorAll('source');
    expect(sources.length).toBe(1);
    expect(sources[0].getAttribute('srcset')).toBe('https://x.com/ok.jpg 1x');
  });

  it('falls back to a bare <img> (no empty <picture>) when every source is unsafe', () => {
    const fig = createFigure(SRC, {
      sources: [{ srcset: 'javascript:x 1x' }, { srcset: '' }],
    }, {}, document);
    expect(fig.querySelector('picture')).toBeNull();
    expect(fig.querySelector('img')).not.toBeNull();
  });

  it('img query still resolves through the <picture> wrapper (manager contract)', () => {
    const fig = createFigure(SRC, { sources: [{ srcset: 'https://x.com/a.jpg 1x' }] }, {}, document);
    // Image managers locate the img via figure.querySelector('img') — must work nested.
    expect(fig.querySelector('img')).not.toBeNull();
    expect(fig.querySelector('img').src).toContain('a.jpg');
  });

  it('sanitizer round-trip preserves <picture>/<source> and scheme-checks srcset', () => {
    const dirty = '<figure class="oe-figure" contenteditable="false" data-oe-island="image">'
      + '<picture>'
      + '<source srcset="https://x.com/a-2x.jpg 2x" media="(min-width: 800px)" type="image/jpeg">'
      + '<source srcset="javascript:alert(1) 1x">'
      + '<img src="https://x.com/a.jpg" alt="ok">'
      + '</picture>'
      + '<figcaption contenteditable="true" data-oe-caption=""></figcaption>'
      + '</figure>';
    const clean = sanitize(dirty, { document });
    // safe <picture> survives with the safe <source>...
    expect(clean).toContain('<picture>');
    expect(clean).toContain('srcset="https://x.com/a-2x.jpg 2x"');
    expect(clean).toContain('media="(min-width: 800px)"');
    // ...and the unsafe-srcset <source> is stripped (srcset removed → source has no srcset).
    expect(clean).not.toContain('javascript:alert(1)');
    // <img> fallback and figure island contract intact.
    expect(clean).toContain('<img');
    expect(clean).toContain('data-oe-island="image"');
  });
});

// ── 9.13, 9.14, 9.18 — createFigure ──────────────────────────────────────────

describe('9.13 / 9.14 / 9.18 — createFigure', () => {
  it('returns null for unsafe src', () => {
    expect(createFigure('javascript:x', {}, {}, document)).toBeNull();
  });

  it('produces <figure contenteditable="false" data-oe-island="image">', () => {
    const fig = createFigure('https://x.com/a.jpg', {}, {}, document);
    expect(fig.tagName.toLowerCase()).toBe('figure');
    expect(fig.getAttribute('contenteditable')).toBe('false');
    expect(fig.getAttribute('data-oe-island')).toBe('image');
  });

  it('contains an <img> with the correct src', () => {
    const fig = createFigure('https://x.com/a.jpg', {}, {}, document);
    const img = fig.querySelector('img');
    expect(img).not.toBeNull();
    expect(img.src).toContain('a.jpg');
  });

  it('9.14 — img has loading="lazy" by default', () => {
    const fig = createFigure('https://x.com/a.jpg', {}, {}, document);
    expect(fig.querySelector('img').loading).toBe('lazy');
  });

  it('9.14 — loading="eager" when imageLazyLoad is false', () => {
    const fig = createFigure('https://x.com/a.jpg', {}, { imageLazyLoad: false }, document);
    expect(fig.querySelector('img').loading).toBe('eager');
  });

  it('9.3 — applies imageDefaultWidth as style width when no size given', () => {
    const fig = createFigure('https://x.com/a.jpg', {}, { imageDefaultWidth: 300 }, document);
    expect(fig.querySelector('img').style.width).toBe('300px');
  });
  it('9.3 — does NOT override an explicit width with imageDefaultWidth', () => {
    const fig = createFigure('https://x.com/a.jpg', { width: 120 }, { imageDefaultWidth: 300 }, document);
    const img = fig.querySelector('img');
    expect(img.getAttribute('width')).toBe('120');
    expect(img.style.width).toBe('');
  });
  it('9.3 — no default width when config unset', () => {
    const fig = createFigure('https://x.com/a.jpg', {}, {}, document);
    expect(fig.querySelector('img').style.width).toBe('');
  });

  it('9.13 — contains <figcaption contenteditable="true">', () => {
    const fig = createFigure('https://x.com/a.jpg', {}, {}, document);
    const cap = fig.querySelector('figcaption');
    expect(cap).not.toBeNull();
    expect(cap.getAttribute('contenteditable')).toBe('true');
    expect(cap.getAttribute('data-oe-caption')).toBe('');
  });

  it('sets alt and title attributes', () => {
    const fig = createFigure('https://x.com/a.jpg', { alt: 'Test alt', title: 'Test title' }, {}, document);
    const img = fig.querySelector('img');
    expect(img.alt).toBe('Test alt');
    expect(img.title).toBe('Test title');
  });

  it('9.12 — preserves srcset and sizes attributes', () => {
    const fig = createFigure('https://x.com/a.jpg', {
      srcset: 'a.jpg 1x, b.jpg 2x', sizes: '(max-width:600px) 100vw, 600px',
    }, {}, document);
    const img = fig.querySelector('img');
    expect(img.getAttribute('srcset')).toBe('a.jpg 1x, b.jpg 2x');
    expect(img.getAttribute('sizes')).toBe('(max-width:600px) 100vw, 600px');
  });
});

// ── 9.9 — applyAlignment ─────────────────────────────────────────────────────

describe('9.9 — applyAlignment (class-only, 2026-07-16)', () => {
  function makeFig() { return createFigure('https://x.com/a.jpg', {}, {}, document); }

  // Alignment is now CLASS-DRIVEN (layout lives in CSS). applyAlignment toggles
  // exactly one class and writes NO inline float/display/margin, so the center
  // fix (fit-content + auto margins) can work and there's one source of truth.
  it('left applies the class and writes no inline float', () => {
    const fig = makeFig();
    applyAlignment(fig, 'left');
    expect(fig.classList.contains('oe-figure--left')).toBe(true);
    expect(fig.style.cssFloat).toBe('');           // no inline duplication
  });

  it('right applies the class and writes no inline float', () => {
    const fig = makeFig();
    applyAlignment(fig, 'right');
    expect(fig.classList.contains('oe-figure--right')).toBe(true);
    expect(fig.style.cssFloat).toBe('');
  });

  it('center applies the class and writes no inline display/margin', () => {
    const fig = makeFig();
    applyAlignment(fig, 'center');
    expect(fig.classList.contains('oe-figure--center')).toBe(true);
    expect(fig.style.display).toBe('');            // CSS handles fit-content + auto margins
    expect(fig.style.margin).toBe('');
  });

  it('inline applies the class and writes no inline display', () => {
    const fig = makeFig();
    applyAlignment(fig, 'inline');
    expect(fig.classList.contains('oe-figure--inline')).toBe(true);
    expect(fig.style.display).toBe('');
  });

  it('changing alignment clears previous alignment classes', () => {
    const fig = makeFig();
    applyAlignment(fig, 'left');
    applyAlignment(fig, 'center');
    expect(fig.classList.contains('oe-figure--left')).toBe(false);
    expect(fig.classList.contains('oe-figure--center')).toBe(true);
  });

  it('clears stale inline styles a pre-fix document may carry', () => {
    const fig = makeFig();
    // simulate an old document where inline styles were written
    fig.style.cssFloat = 'left'; fig.style.margin = '0 auto'; fig.style.display = 'block';
    applyAlignment(fig, 'center');
    expect(fig.style.cssFloat).toBe('');
    expect(fig.style.margin).toBe('');
    expect(fig.style.display).toBe('');
    expect(fig.classList.contains('oe-figure--center')).toBe(true);
  });
});

// ── 9.16 — wrapInLink ────────────────────────────────────────────────────────

describe('9.16 — wrapInLink', () => {
  it('wraps img in <a> with correct href and rel', () => {
    const fig = createFigure('https://x.com/a.jpg', {}, {}, document);
    wrapInLink(fig, 'https://example.com');
    const a = fig.querySelector('a');
    expect(a).not.toBeNull();
    expect(a.href).toContain('example.com');
    expect(a.rel).toContain('noopener');
    expect(a.querySelector('img')).not.toBeNull();
  });

  it('updates existing <a> href when called again', () => {
    const fig = createFigure('https://x.com/a.jpg', {}, {}, document);
    wrapInLink(fig, 'https://first.com');
    wrapInLink(fig, 'https://second.com');
    const anchors = fig.querySelectorAll('a');
    expect(anchors.length).toBe(1); // not double-wrapped
    expect(anchors[0].href).toContain('second.com');
  });

  it('does nothing when href is empty', () => {
    const fig = createFigure('https://x.com/a.jpg', {}, {}, document);
    wrapInLink(fig, '');
    expect(fig.querySelector('a')).toBeNull();
  });
});

// ── 9.2 — insertFigure ────────────────────────────────────────────────────────

describe('9.2 — insertFigure inserts figure into editor DOM', () => {
  it('figure appears in editor element after insert', () => {
    const fig = createFigure('https://x.com/a.jpg', {}, {}, document);
    insertFigure(editor, fig);
    const edEl = editor.getEditorElement();
    expect(edEl.querySelector('[data-oe-island="image"]')).not.toBeNull();
  });

  it('a <p> exists after the inserted figure', () => {
    const fig = createFigure('https://x.com/a.jpg', {}, {}, document);
    insertFigure(editor, fig);
    const edEl = editor.getEditorElement();
    const figures = edEl.querySelectorAll('figure');
    expect(figures.length).toBeGreaterThan(0);
    const lastFig = figures[figures.length - 1];
    const next = lastFig.nextElementSibling;
    expect(next).not.toBeNull();
    expect(next.tagName.toLowerCase()).toBe('p');
  });

  it('emits afterCommand:insertImage', () => {
    const events = [];
    editor.on('afterCommand', (e) => events.push(e.command));
    const fig = createFigure('https://x.com/a.jpg', {}, {}, document);
    insertFigure(editor, fig);
    expect(events).toContain('insertImage');
  });
});

// ── 9.7 + 9.11 — plugin install + keyboard delete ────────────────────────────

describe('9.7 / 9.11 — plugin install, select, keyboard delete', () => {
  it('plugin installs without error', () => {
    const p = makePlugin();
    expect(() => editor.plugins.install(p)).not.toThrow();
    editor.plugins.uninstall('image');
  });

  it('9.11 — Backspace on selected figure removes it from DOM', () => {
    const p = makePlugin();
    editor.plugins.install(p);

    const fig = createFigure('https://x.com/a.jpg', {}, {}, document);
    insertFigure(editor, fig);

    // Manually select the figure via the selection manager
    p._selection._selectFigure(fig);
    expect(p._selection.getSelected()).toBe(fig);

    // Fire keydown Backspace through the plugin's onKeyDown hook
    const fakeEvent = { key: 'Backspace', preventDefault: () => {} };
    const handled = p.onKeyDown(fakeEvent);
    expect(handled).toBe(true);
    expect(editor.getEditorElement().querySelector('[data-oe-island="image"]')).toBeNull();

    editor.plugins.uninstall('image');
  });

  it('plugin uninstalls cleanly', () => {
    const p = makePlugin();
    editor.plugins.install(p);
    expect(() => editor.plugins.uninstall('image')).not.toThrow();
  });
});

// ── 9.8 — ImageResizeManager.computeResize (pure math) ───────────────────────

describe('9.8 — resize math (computeResize)', () => {
  const baseDrag = { pos: 'se', startX: 100, startY: 100, startW: 200, startH: 150, aspect: 200 / 150 };

  it('dragging se corner right-down increases width and height', () => {
    const { width, height } = ImageResizeManager.computeResize(baseDrag, 150, 130, false);
    expect(width).toBeGreaterThan(200);
    expect(height).toBeGreaterThan(150);
  });

  it('dragging se corner left-up decreases dimensions but stays above minimum', () => {
    const { width, height } = ImageResizeManager.computeResize(baseDrag, 50, 80, false);
    expect(width).toBeGreaterThanOrEqual(40);
    expect(height).toBeGreaterThanOrEqual(20);
  });

  it('nw corner: dragging left increases size (inverted delta)', () => {
    const drag = { ...baseDrag, pos: 'nw' };
    const { width } = ImageResizeManager.computeResize(drag, 50, 80, false);
    // nw flips dx, so moving left (dx < 0) → flipX → positive delta → larger
    expect(width).toBeGreaterThan(200);
  });

  it('minimum width is enforced', () => {
    const drag = { ...baseDrag, startW: 50 };
    const { width } = ImageResizeManager.computeResize(drag, 50, 100, false); // extreme shrink
    expect(width).toBeGreaterThanOrEqual(40);
  });

  // ── 2026-07-16: corner drag PRESERVES aspect by default; Shift frees it. ──
  it('corner drag KEEPS aspect ratio by default (no distortion)', () => {
    // drag mostly horizontally; height must follow width to keep the ratio
    const { width, height, locked } = ImageResizeManager.computeResize(baseDrag, 300, 110, false);
    expect(Math.abs(width / height - baseDrag.aspect)).toBeLessThan(0.05);
    expect(locked).toBe(true);   // default corner drag reports ratio-locked
  });

  it('Shift on a corner FREES the aspect ratio (deliberate stretch)', () => {
    // pull width far, height little — free-form lets them diverge from aspect
    const { width, height, locked } = ImageResizeManager.computeResize(baseDrag, 400, 105, true);
    expect(width).toBeGreaterThan(250);
    expect(height).toBeLessThan(200);
    expect(Math.abs(width / height - baseDrag.aspect)).toBeGreaterThan(0.1);
    expect(locked).toBe(false);
  });

  // ── edge handles: one axis; the OTHER becomes auto (height === null). ──
  it('east (e) edge drag changes width only and sets height to auto (null)', () => {
    const drag = { ...baseDrag, pos: 'e' };
    const { width, height } = ImageResizeManager.computeResize(drag, 260, 100, false);
    expect(width).toBeGreaterThan(200);
    expect(height).toBeNull();   // auto → browser preserves aspect
  });

  it('south (s) edge drag changes height only and sets width to auto (null)', () => {
    const drag = { ...baseDrag, pos: 's' };
    const { width, height, derivedWidth } = ImageResizeManager.computeResize(drag, 100, 300, false);
    expect(height).toBeGreaterThan(150);
    expect(width).toBeNull();               // width → auto (browser keeps ratio)
    // the aspect-derived width is provided for the badge / commit (no reflow)
    expect(Math.abs(derivedWidth / height - baseDrag.aspect)).toBeLessThan(0.05);
  });

  it('east (e) edge drag provides an aspect-derived height (no DOM measurement)', () => {
    const drag = { ...baseDrag, pos: 'e' };
    const { width, derivedHeight } = ImageResizeManager.computeResize(drag, 320, 100, false);
    // derivedHeight follows the aspect so the badge/commit needs no reflow (#2)
    expect(Math.abs(width / derivedHeight - baseDrag.aspect)).toBeLessThan(0.05);
  });

  // #1: the drag captures aspect from the image's INTRINSIC ratio, so a prior
  // free-stretch doesn't poison a later proportional drag.
  it('drag aspect comes from naturalWidth/naturalHeight, not the stretched box', () => {
    const mgr = new ImageResizeManager();
    const fig = document.createElement('figure');
    const img = document.createElement('img');
    // simulate a STRETCHED render (400×80 = ratio 5) but NATURAL 200×100 (ratio 2)
    Object.defineProperty(img, 'naturalWidth', { value: 200, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 100, configurable: true });
    img.style.width = '400px'; img.style.height = '80px';
    fig.appendChild(img);
    mgr._figure = fig;
    // drive the drag-start capture
    mgr._onHandleMouseDown({ preventDefault() {}, stopPropagation() {}, clientX: 0, clientY: 0, touches: null }, 'se');
    expect(Math.abs(mgr._drag.aspect - 2)).toBeLessThan(0.001);  // intrinsic 2, NOT 5
    mgr._cancelDrag();
  });
});

// ── Sanitizer: img now allows srcset, sizes, loading, title ──────────────────

describe('Sanitizer — img attribute whitelist extended (9.12)', () => {
  it('sanitize preserves srcset, sizes, loading, title on img', async () => {
    const { sanitize } = await import('../src/sanitizer/sanitizer.js');
    const html = '<img src="https://x.com/a.jpg" srcset="a.jpg 1x" sizes="100vw" loading="lazy" title="Hello" alt="World">';
    const out  = sanitize(html, { document });
    expect(out).toContain('srcset=');
    expect(out).toContain('sizes=');
    expect(out).toContain('loading=');
    expect(out).toContain('title=');
  });
});
