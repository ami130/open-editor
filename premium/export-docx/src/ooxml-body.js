/**
 * ooxml-body.js — canonical DOM → WordprocessingML body (<w:p>/<w:tbl> …).
 *
 * Pure: `bodyXml(html, doc) → string` (the inner XML for word/document.xml's
 * <w:body>, minus the trailing <w:sectPr>). Walks the same block/inline shape
 * as the Markdown/PDF serializers. Elements with no Word equivalent contribute
 * their text. jsdom-parsed nodes in; escaped XML out.
 *
 * WordprocessingML primer (only what we emit):
 *   paragraph = <w:p>[<w:pPr>…props…</w:pPr>] <w:r>…runs…</w:r> </w:p>
 *   run       = <w:r>[<w:rPr>…bold/italic…</w:rPr>] <w:t xml:space="preserve">text</w:t></w:r>
 *   heading   = a <w:p> whose pPr has <w:pStyle w:val="Heading1"/>
 *   list item = a <w:p> whose pPr has <w:numPr> (ilvl + numId)
 *   table     = <w:tbl> > <w:tr> > <w:tc> > <w:p>…
 */

import { cssColorToHex, parseStyle } from './css-color.js';
import { tableXml } from './ooxml-table.js';

// XML 1.0 forbids most C0 control characters entirely — they can't even be
// written as numeric entities. Only TAB (U+0009), LF (U+000A) and CR (U+000D)
// are legal. A stray control char (e.g. a NUL or vertical-tab pasted from a
// terminal) written raw into document.xml makes the whole package not
// well-formed → Word reports "the file is corrupt". Strip them before escaping.
// eslint-disable-next-line no-control-regex -- intentionally matches the XML-illegal C0 controls so they can be STRIPPED (leaving them corrupts document.xml)
const XML_ILLEGAL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

export function escapeXml(s) {
  return String(s == null ? '' : s)
    .replace(XML_ILLEGAL, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/**
 * One run with the given active formatting marks.
 *
 * CRITICAL: OOXML's CT_RPr (EG_RPrBase) mandates a FIXED child order — Word
 * rejects/repairs a document whose <w:rPr> children are out of order or that
 * has a duplicate <w:rStyle> (maxOccurs=1). The order below follows the schema:
 *   rStyle → b → i → strike → color → sz → shd → u → vertAlign
 * and exactly ONE rStyle is chosen (a run can be link OR code, not two named
 * character styles — link appearance also comes from the enclosing
 * <w:hyperlink>; a code run inside a link keeps Code and the hyperlink wrapper
 * still colors/underlines it). Emitting in list order (the previous bug) put
 * b/i/u before rStyle and could emit two rStyle elements → invalid document.
 */
function run(text, marks) {
  if (!text) return '';
  const rPr = [];
  // 1. rStyle (exactly one; Code wins over Hyperlink since the <w:hyperlink>
  //    wrapper already applies link styling to its runs).
  const rStyle = marks.code ? 'Code' : (marks.hyperlink ? 'Hyperlink' : null);
  if (rStyle) rPr.push(`<w:rStyle w:val="${rStyle}"/>`);
  // 2. b, i (bold/italic toggles)
  if (marks.b) rPr.push('<w:b/>');
  if (marks.i) rPr.push('<w:i/>');
  // 3. strike (before color per schema)
  if (marks.s) rPr.push('<w:strike/>');
  // 4. color
  if (marks.color) rPr.push(`<w:color w:val="${marks.color}"/>`);
  // 5. sz (half-points)
  if (marks.sz) rPr.push(`<w:sz w:val="${marks.sz}"/>`);
  // 6. shd (run shading / highlight background) — comes after sz, before u
  if (marks.highlight) rPr.push(`<w:shd w:val="clear" w:fill="${marks.highlight}"/>`);
  // 7. u (underline)
  if (marks.u) rPr.push('<w:u w:val="single"/>');
  // 8. vertAlign (superscript/subscript) — last of what we emit
  if (marks.va) rPr.push(`<w:vertAlign w:val="${marks.va}"/>`);
  const props = rPr.length ? `<w:rPr>${rPr.join('')}</w:rPr>` : '';
  return `<w:r>${props}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

/** CSS font-size (px/pt) → OOXML half-points, or null. */
function cssFontSizeToHalfPoints(v) {
  if (typeof v !== 'string') return null;
  const px = (v.match(/([\d.]+)px/) || [])[1];
  const pt = (v.match(/([\d.]+)pt/) || [])[1];
  if (pt) return Math.round(Number(pt) * 2);
  if (px) return Math.round((Number(px) * 72 / 96) * 2); // px→pt→half-points
  return null;
}

/** Merge a <span>/<mark>'s inline style into the active run marks. */
function marksFromStyledInline(el, tag, marks) {
  const next = { ...marks };
  const style = parseStyle(el.getAttribute && el.getAttribute('style'));
  if (tag === 'mark') next.highlight = next.highlight || 'FFFF00';
  const c = cssColorToHex(style.color);
  if (c) next.color = c;
  const bg = cssColorToHex(style['background-color'] || style.background);
  if (bg) next.highlight = bg;
  const sz = cssFontSizeToHalfPoints(style['font-size']);
  if (sz) next.sz = sz;
  if ((style['font-weight'] === 'bold' || Number(style['font-weight']) >= 600)) next.b = true;
  if (style['font-style'] === 'italic') next.i = true;
  const deco = style['text-decoration'] || '';
  if (deco.includes('underline')) next.u = true;
  if (deco.includes('line-through')) next.s = true;
  return next;
}

/** Collect the runs of an inline subtree, threading active formatting marks. */
function inlineRuns(node, marks, ctx) {
  let out = '';
  for (const child of node.childNodes) {
    if (child.nodeType === 3) { out += run(child.nodeValue, marks); continue; }
    if (child.nodeType !== 1) continue;
    const tag = child.tagName.toLowerCase();
    const next = { ...marks };
    switch (tag) {
      case 'strong': case 'b': next.b = true; out += inlineRuns(child, next, ctx); break;
      case 'em': case 'i': next.i = true; out += inlineRuns(child, next, ctx); break;
      case 'u': next.u = true; out += inlineRuns(child, next, ctx); break;
      case 's': case 'del': case 'strike': next.s = true; out += inlineRuns(child, next, ctx); break;
      case 'code': next.code = true; out += inlineRuns(child, next, ctx); break;
      case 'br': out += '<w:r><w:br/></w:r>'; break;
      case 'sup': out += inlineRuns(child, { ...next, va: 'superscript' }, ctx); break;
      case 'sub': out += inlineRuns(child, { ...next, va: 'subscript' }, ctx); break;
      case 'a': {
        const href = child.getAttribute && child.getAttribute('href');
        // Real hyperlink: register an external relationship and wrap the runs in
        // <w:hyperlink r:id>. The link text is styled with the Hyperlink char
        // style (blue + underline). Falls back to plain underlined text when
        // there's no usable href or no collector (keeps content either way).
        const h = href && href.trim();
        if (h && h.startsWith('#')) {
          // Internal anchor (M5): must become a Word bookmark REFERENCE
          // (<w:hyperlink w:anchor>), NOT an external relationship — the latter
          // produced a broken link. The anchor name is the target id sans '#'
          // (sanitized to Word's bookmark-name charset).
          const anchor = bookmarkName(h.slice(1));
          const inner = inlineRuns(child, { ...next, hyperlink: true }, ctx);
          out += `<w:hyperlink w:anchor="${anchor}">${inner}</w:hyperlink>`;
        } else if (h && ctx && ctx.resources && /^(https?:|mailto:|tel:|\/)/i.test(h)) {
          const rId = ctx.resources.addHyperlink(h);
          const inner = inlineRuns(child, { ...next, hyperlink: true }, ctx);
          out += `<w:hyperlink r:id="${rId}">${inner}</w:hyperlink>`;
        } else {
          out += inlineRuns(child, { ...next, u: true }, ctx);
        }
        break;
      }
      case 'img': {
        out += imageRun(child, ctx);
        break;
      }
      case 'span': case 'mark':
        out += inlineRuns(child, marksFromStyledInline(child, tag, next), ctx);
        break;
      default: out += inlineRuns(child, next, ctx);
    }
  }
  return out;
}

// ── Image embedding ──────────────────────────────────────────────────────────
const EMU_PER_PX = 9525;           // 914400 EMU/inch ÷ 96 px/inch
const DEFAULT_IMG_PX = 400;        // fallback width when the <img> has no size
// Content width in px (A4 portrait minus 1" margins ≈ 6.27") — used to resolve
// a `%` image width into an absolute pixel size (Word drawings need EMU, not %).
const CONTENT_WIDTH_PX = 602;

/**
 * Pixel dimension from an attribute or inline style; NaN if absent (I16).
 * Understands px, bare numbers, and (for width) `%` resolved against the page
 * content width — a `width:50%` image previously fell through to the 400px
 * default, coming out the wrong size.
 */
function imgDimPx(img, attr, styleProp) {
  const a = parseFloat(img.getAttribute(attr) || '');
  if (Number.isFinite(a) && a > 0) return a;      // ignore 0/negative attrs (I8c)
  const raw = (parseStyle(img.getAttribute('style'))[styleProp] || '').trim();
  if (styleProp === 'width' && raw.endsWith('%')) {
    const pct = parseFloat(raw);
    // Clamp % to [0,100] so a stray width:120% can't overflow the page; a Word
    // drawing needs an absolute EMU size, so this resolves against the content
    // width. (Inside a narrow table cell, fixed table-layout then scales it to
    // the column, so it can't blow the cell out.) (I8a)
    if (Number.isFinite(pct) && pct > 0) return (CONTENT_WIDTH_PX * Math.min(pct, 100)) / 100;
  }
  const s = parseFloat(raw.replace('px', ''));
  return Number.isFinite(s) && s > 0 ? s : NaN;   // ignore 0/negative styles (I8c)
}

/**
 * An inline image run. Embeds a real <w:drawing> from either a data: URI
 * (decoded in-process) or a pre-fetched remote http(s) image (resolved ahead
 * of time by image-fetch.js and passed in via ctx.resolvedImages — bodyXml's
 * walk is synchronous, so the network fetch always happens BEFORE this runs).
 * Falls back to a labeled text placeholder when the image can't be embedded
 * (no collector, fetch failed, unsupported format) so content is never
 * silently lost. `ctx` carries the resource collector + a per-doc drawing id.
 */
function imageRun(img, ctx) {
  const src = img.getAttribute('src') || '';
  const alt = img.getAttribute('alt') || '';
  let added = null;
  if (ctx && ctx.resources) {
    const resolved = ctx.resolvedImages && ctx.resolvedImages.get(src);
    added = resolved ? ctx.resources.addResolvedImage(resolved) : ctx.resources.addImage(src);
  }
  if (!added) {
    // Remote/unembeddable image → placeholder (documented: only data: URIs embed).
    const label = alt ? `[Image: ${alt}]` : '[Image]';
    return `<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">${escapeXml(label)}</w:t></w:r>`;
  }
  // Resolve px sizes (0/negative already filtered out by imgDimPx → NaN).
  // Width is capped at the page content width so an oversized image never
  // exceeds the page. Height falls back to a 4:3 ratio when unknown (we don't
  // decode the image header for its true aspect); both are clamped to ≥1px so
  // the <wp:extent> is never zero/negative (Word errors on that). (I8b/I8c)
  const wPx = imgDimPx(img, 'width', 'width');
  const hPx = imgDimPx(img, 'height', 'height');
  const wSafe = Math.min(Number.isFinite(wPx) ? wPx : DEFAULT_IMG_PX, CONTENT_WIDTH_PX);
  const hSafe = Number.isFinite(hPx) ? hPx : wSafe * 0.75;
  const w = Math.max(1, Math.round(wSafe * EMU_PER_PX));
  const h = Math.max(1, Math.round(hSafe * EMU_PER_PX));
  const id = ctx.nextDrawingId();
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">`
    + `<wp:extent cx="${w}" cy="${h}"/>`
    + `<wp:docPr id="${id}" name="Picture ${id}" descr="${escapeXml(alt)}"/>`
    + '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
    + '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
    + '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
    + `<pic:nvPicPr><pic:cNvPr id="${id}" name="Picture ${id}"/><pic:cNvPicPr/></pic:nvPicPr>`
    + `<pic:blipFill><a:blip r:embed="${added.rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
    + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>`
    + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>'
    + '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
}

/** CSS/HTML text-align → OOXML w:jc value, or null if none/unsupported. */
function alignToJc(el) {
  if (!el || !el.getAttribute) return null;
  const style = parseStyle(el.getAttribute('style'));
  const a = (style['text-align'] || el.getAttribute('align') || '').toLowerCase();
  const MAP = { left: 'left', right: 'right', center: 'center', justify: 'both' };
  return MAP[a] || null;
}

/**
 * A <w:p> with optional pPr style/numbering, text alignment, and the element's
 * inline runs. pPr children are emitted in OOXML CT_PPr schema order:
 *   pStyle → numPr → jc  (getting this order wrong makes Word repair the doc).
 */
function para(el, opts = {}) {
  const pPr = [];
  if (opts.style) pPr.push(`<w:pStyle w:val="${opts.style}"/>`);
  if (opts.numId != null) {
    pPr.push(`<w:numPr><w:ilvl w:val="${opts.ilvl || 0}"/><w:numId w:val="${opts.numId}"/></w:numPr>`);
  }
  // text-align (I1): honor an explicit align on this element, or one passed in
  // by the caller (e.g. a table cell's alignment applies to its paragraph).
  const jc = opts.jc || alignToJc(el);
  if (jc) pPr.push(`<w:jc w:val="${jc}"/>`);
  const props = pPr.length ? `<w:pPr>${pPr.join('')}</w:pPr>` : '';
  const runs = inlineRuns(el, opts.baseMarks || {}, opts.ctx);
  // Bookmark target (M5): an element with an id becomes a Word bookmark so a
  // <w:hyperlink w:anchor> elsewhere can jump to it. Also cover a nested
  // <a id> anchor (bookmark plugin markup) inside this block.
  const bm = bookmarkFor(el, opts.ctx);
  return `<w:p>${props}${bm.start}${runs}${bm.end}</w:p>`;
}

/**
 * Turn an HTML id / anchor fragment into a valid Word bookmark name (I7).
 * Word requires: only letters/digits/underscore-ish chars, MUST start with a
 * letter or underscore (not a digit), and ≤40 characters — otherwise Word
 * silently drops or renames the bookmark, breaking the matching w:anchor link.
 * MUST be deterministic so the reference and the target derive the SAME name.
 */
function bookmarkName(rawId) {
  let name = String(rawId || '').replace(/[^\w.-]/g, '_');
  if (!name) return 'top';
  if (!/^[A-Za-z_]/.test(name)) name = `_${name}`; // no leading digit/dot/hyphen
  return name.slice(0, 40);
}

/**
 * If `el` (or a descendant anchor) carries an `id`, produce the
 * <w:bookmarkStart>/<w:bookmarkEnd> pair that makes it a jump target (M5).
 * Bookmark ids are allocated from ctx.nextBookmarkId(). Returns empty strings
 * when there's no id or no ctx.
 */
function bookmarkFor(el, ctx) {
  if (!ctx || !ctx.nextBookmarkId || !el.getAttribute) return { start: '', end: '' };
  const rawId = el.getAttribute('id') || (el.querySelector && el.querySelector('[id]') ? el.querySelector('[id]').getAttribute('id') : '');
  if (!rawId) return { start: '', end: '' };
  const name = bookmarkName(rawId);
  const id = ctx.nextBookmarkId();
  return { start: `<w:bookmarkStart w:id="${id}" w:name="${name}"/>`, end: `<w:bookmarkEnd w:id="${id}"/>` };
}

const HEADING_STYLE = { h1: 'Heading1', h2: 'Heading2', h3: 'Heading3', h4: 'Heading4', h5: 'Heading5', h6: 'Heading6' };

// Block tags that, inside a container (list item), must become their own
// paragraph rather than flattening into one run stream (I6).
const BLOCK_TAGS = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'ul', 'ol', 'dl', 'table', 'figure', 'hr']);

const MAX_LIST_LEVEL = 3; // numbering.xml defines ilvl 0..3

/**
 * Emit list-item paragraphs; nested lists recurse with a deeper ilvl.
 * Handles:
 *  - TO-DO lists (<ul data-todo-list> / <li data-todo data-checked>): the
 *    checkbox + checked state are CSS-only in the editor, so they'd vanish in
 *    Word. We prefix each item with a real ☑/☐ glyph so state survives (C3).
 *  - ilvl is clamped to MAX_LIST_LEVEL so a >4-deep list doesn't reference an
 *    undefined numbering level (I5).
 *  - `numId` is passed in by the caller so each top-level ordered list can get
 *    its own numbering instance (restart), and ordered start/type are honored
 *    upstream (I3/I4).
 */
function listParas(listEl, ordered, ilvl, ctx, numId) {
  const lvl = Math.min(ilvl, MAX_LIST_LEVEL);
  const isTodo = listEl.hasAttribute && listEl.hasAttribute('data-todo-list');
  let out = '';
  for (const li of listEl.children) {
    if (li.tagName.toLowerCase() !== 'li') continue;
    const clone = li.cloneNode(true);
    for (const sub of clone.querySelectorAll(':scope > ul, :scope > ol')) sub.remove();
    // Strip the CSS-only checkbox carrier span so it doesn't add stray runs.
    for (const chk of clone.querySelectorAll(':scope > .oe-todo-check')) chk.remove();
    // A to-do item renders as a plain (no-number) paragraph prefixed with a
    // checkbox glyph reflecting its checked state — NOT as a numbered/bulleted
    // list item (Word has no native checkbox list).
    if (isTodo && li.hasAttribute('data-todo')) {
      const checked = li.getAttribute('data-checked') === 'true';
      const glyph = checked ? '☑ ' : '☐ '; // ☑ / ☐
      // The glyph rides on the FIRST line. If the todo item has block children
      // (e.g. a pasted <p>), keep them as separate paragraphs (I6) instead of
      // flattening — the first paragraph carries the checkbox glyph.
      const todoBlocks = Array.from(clone.children).filter((c) => BLOCK_TAGS.has(c.tagName.toLowerCase()));
      if (todoBlocks.length) {
        let firstDone = false;
        for (const c of clone.children) {
          if (!BLOCK_TAGS.has(c.tagName.toLowerCase())) continue;
          if (!firstDone) {
            out += `<w:p><w:r><w:t xml:space="preserve">${glyph}</w:t></w:r>${inlineRuns(c, {}, ctx)}</w:p>`;
            firstDone = true;
          } else out += blockXml(c, ctx);
        }
      } else {
        out += `<w:p><w:r><w:t xml:space="preserve">${glyph}</w:t></w:r>${inlineRuns(clone, {}, ctx)}</w:p>`;
      }
    } else {
      // A list item with block children (multiple <p>, a <blockquote>, …) must
      // become multiple paragraphs (I6): the FIRST carries the list number/
      // bullet, the rest are indented continuation paragraphs under the item.
      const blockChildren = Array.from(clone.children).filter((c) => BLOCK_TAGS.has(c.tagName.toLowerCase()));
      if (blockChildren.length) {
        let firstDone = false;
        for (const c of clone.children) {
          const t = c.tagName.toLowerCase();
          if (!BLOCK_TAGS.has(t)) continue;
          if (!firstDone) { out += para(c, { numId, ilvl: lvl, ctx }); firstDone = true; }
          else out += blockXml(c, ctx);
        }
      } else {
        out += para(clone, { numId, ilvl: lvl, ctx });
      }
    }
    for (const sub of li.children) {
      const t = sub.tagName.toLowerCase();
      if (t === 'ol') {
        // A nested ordered list gets its OWN numbering instance (I11) so it
        // restarts and honors its own start/type at this depth — instead of
        // silently continuing the parent's numbering with the wrong format.
        const subNumId = (ctx && ctx.resources && ctx.resources.addOrderedList)
          ? ctx.resources.addOrderedList({ start: sub.getAttribute('start'), type: sub.getAttribute('type'), ilvl: Math.min(ilvl + 1, MAX_LIST_LEVEL) })
          : numId;
        out += listParas(sub, true, ilvl + 1, ctx, subNumId);
      } else if (t === 'ul') {
        out += listParas(sub, false, ilvl + 1, ctx, 1);
      }
    }
  }
  return out;
}

// Table serialization lives in ooxml-table.js (kept separate for the length
// budget). tableXml is called from blockXml with para/escapeXml injected.

function blockXml(el, ctx) {
  const tag = el.tagName.toLowerCase();
  if (HEADING_STYLE[tag]) return para(el, { style: HEADING_STYLE[tag], ctx });
  if (tag === 'p' || tag === 'div') return para(el, { ctx });
  if (tag === 'ul' || tag === 'ol') {
    // Each ordered list gets its OWN numbering instance so separate lists
    // restart at 1 (or their `start`) instead of continuing each other, and so
    // `type` (a/A/i/I) picks the right format. Bullet lists share numId 1.
    const numId = (tag === 'ol' && ctx && ctx.resources && ctx.resources.addOrderedList)
      ? ctx.resources.addOrderedList({ start: el.getAttribute('start'), type: el.getAttribute('type') })
      : (tag === 'ol' ? 2 : 1);
    return listParas(el, tag === 'ol', 0, ctx, numId);
  }
  if (tag === 'blockquote') {
    return Array.from(el.children).length
      ? Array.from(el.children).map((c) => {
        const t = c.tagName.toLowerCase();
        if (HEADING_STYLE[t] || t === 'p' || t === 'div') return para(c, { style: 'Quote', ctx });
        return blockXml(c, ctx);
      }).join('')
      : para(el, { style: 'Quote', ctx });
  }
  if (tag === 'pre') {
    const code = el.querySelector('code') || el;
    const text = code.textContent.replace(/\n$/, '');
    // Each source line becomes a Code-styled paragraph (Word has no <pre>).
    return text.split('\n').map((line) => {
      const runXml = line ? `<w:r><w:rPr><w:rStyle w:val="Code"/></w:rPr><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r>` : '';
      return `<w:p><w:pPr><w:pStyle w:val="CodeBlock"/></w:pPr>${runXml}</w:p>`;
    }).join('');
  }
  if (tag === 'hr') return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="A0A0A0"/></w:pBdr></w:pPr></w:p>';
  if (tag === 'dl') {
    // Definition list (I2): each <dt> is a bold term paragraph; each <dd> is an
    // indented definition paragraph. Previously fell through to one run-together
    // paragraph.
    let out = '';
    for (const c of el.children) {
      const t = c.tagName.toLowerCase();
      if (t !== 'dt' && t !== 'dd') continue;
      const ddBlocks = Array.from(c.children).filter((x) => BLOCK_TAGS.has(x.tagName.toLowerCase()));
      if (ddBlocks.length) {
        // Block content inside a term/definition → real paragraphs, not a
        // flattened run stream (I5). The first keeps the dt bold / dd indent;
        // later blocks render as their own paragraphs (e.g. a list keeps its
        // bullets instead of running together).
        let firstDone = false;
        for (const b of c.children) {
          if (!BLOCK_TAGS.has(b.tagName.toLowerCase())) continue;
          if (!firstDone) {
            out += t === 'dt'
              ? para(b, { ctx, baseMarks: { b: true } })
              : `<w:p><w:pPr><w:ind w:left="480"/></w:pPr>${inlineRuns(b, {}, ctx)}</w:p>`;
            firstDone = true;
          } else out += blockXml(b, ctx);
        }
      } else if (t === 'dt') {
        out += para(c, { ctx, baseMarks: { b: true } });
      } else {
        out += `<w:p><w:pPr><w:ind w:left="480"/></w:pPr>${inlineRuns(c, {}, ctx)}</w:p>`;
      }
    }
    return out || '<w:p/>';
  }
  if (tag === 'table') return tableXml(el, { para, escapeXml, ctx });
  if (tag === 'figure') {
    // Embed the figure's <img> (data: URIs / pre-resolved remote images become
    // a real drawing; unembeddable → a placeholder run inside imageRun), then
    // the caption below it.
    const cap = el.querySelector('figcaption');
    const img = el.querySelector('img');
    // DEFENSIVE: an image-shaped figure with NO <img> element at all (e.g. the
    // source HTML was truncated/malformed upstream and the parser dropped an
    // unterminated <img> tag entirely) must still say SOMETHING rather than
    // silently produce an empty paragraph — content should never just vanish
    // with zero trace. This is distinct from imageRun's own placeholder, which
    // handles the case where the <img> element exists but its image couldn't
    // be embedded.
    const imgXml = img ? imageRun(img, ctx)
      : '<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">[Image could not be read]</w:t></w:r>';
    // Figure alignment (I17): the editor's image-styles.js sets a class (or an
    // inline text-align) — center/right must carry over as the paragraph's w:jc
    // so the image lands where the editor shows it, not always inline-left.
    const cls = el.getAttribute('class') || '';
    const jc = /\boe-figure--center\b/.test(cls) ? 'center'
      : /\boe-figure--right\b/.test(cls) ? 'right'
        : /\boe-figure--left\b/.test(cls) ? 'left'
          : alignToJc(el);
    const imgPPr = jc ? `<w:pPr><w:jc w:val="${jc}"/></w:pPr>` : '';
    const capText = cap && cap.textContent.trim();
    const capJc = jc ? `<w:jc w:val="${jc}"/>` : '';
    const capPara = capText
      ? `<w:p><w:pPr><w:pStyle w:val="Caption"/>${capJc}</w:pPr><w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">${escapeXml(capText)}</w:t></w:r></w:p>`
      : '';
    return `<w:p>${imgPPr}${imgXml}</w:p>${capPara}`;
  }
  return para(el, { ctx });
}

/**
 * Build the <w:body> inner XML (blocks only; caller appends <w:sectPr>).
 *
 * @param {string} html
 * @param {Document} doc
 * @param {object} [collector] a createResourceCollector() — pass one to embed
 *   hyperlinks/images; read collector.result() afterwards to build the rels +
 *   media parts. Omitting it keeps the old behavior (links → underlined text,
 *   images → placeholder), so string-only callers/tests are unaffected.
 * @param {Map<string,{mime,ext,bytes}|null>} [resolvedImages] pre-fetched
 *   remote (http/https) image bytes, keyed by <img src>, from
 *   image-fetch.js's resolveRemoteImages(). Fetching is async and this walk is
 *   not, so the caller resolves images BEFORE calling bodyXml and hands the
 *   results in as a plain synchronous lookup. Omit to only embed data: URIs
 *   (the pre-fetch behavior).
 * @returns {string} the <w:body> inner XML
 */
export function bodyXml(html, doc, collector, resolvedImages) {
  const tmp = doc.createElement('div');
  tmp.innerHTML = typeof html === 'string' ? html : '';
  let drawingId = 0;
  let bookmarkId = 0;
  const ctx = {
    resources: collector || null,
    resolvedImages: resolvedImages || null,
    nextDrawingId: () => (drawingId += 1),
    nextBookmarkId: () => (bookmarkId += 1),
    // Exposed so ooxml-table can render block-level cell children (I15) without
    // a circular import back into this module.
    blockXml: (el) => blockXml(el, ctx),
  };
  let out = '';
  for (const child of tmp.children) out += blockXml(child, ctx);
  // Word requires at least one block; guarantee a paragraph.
  return out || '<w:p/>';
}
