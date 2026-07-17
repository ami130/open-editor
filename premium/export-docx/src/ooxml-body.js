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

export function escapeXml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** One run with the given active formatting marks. */
function run(text, marks) {
  if (!text) return '';
  const rPr = [];
  if (marks.b) rPr.push('<w:b/>');
  if (marks.i) rPr.push('<w:i/>');
  if (marks.u) rPr.push('<w:u w:val="single"/>');
  if (marks.s) rPr.push('<w:strike/>');
  if (marks.code) rPr.push('<w:rStyle w:val="Code"/>');
  // Full-fidelity inline styling carried from <span style> / <mark>.
  if (marks.color) rPr.push(`<w:color w:val="${marks.color}"/>`);
  if (marks.highlight) rPr.push(`<w:shd w:val="clear" w:fill="${marks.highlight}"/>`);
  if (marks.sz) rPr.push(`<w:sz w:val="${marks.sz}"/>`); // half-points
  if (marks.va) rPr.push(`<w:vertAlign w:val="${marks.va}"/>`);
  if (marks.hyperlink) rPr.push('<w:rStyle w:val="Hyperlink"/>');
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
        if (href && ctx && ctx.resources && /^(https?:|mailto:|tel:|#|\/)/i.test(href.trim())) {
          const rId = ctx.resources.addHyperlink(href.trim());
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

/** Pixel dimension from an attribute or inline style; NaN if absent. */
function imgDimPx(img, attr, styleProp) {
  const a = parseFloat(img.getAttribute(attr) || '');
  if (Number.isFinite(a)) return a;
  const s = parseFloat((parseStyle(img.getAttribute('style'))[styleProp] || '').replace('px', ''));
  return Number.isFinite(s) ? s : NaN;
}

/**
 * An inline image run. Embeds a data: URI as a real <w:drawing>; for a remote
 * (or unembeddable) src, returns a labeled placeholder run so content is never
 * silently lost. `ctx` carries the resource collector + a per-doc drawing id.
 */
function imageRun(img, ctx) {
  const src = img.getAttribute('src') || '';
  const alt = img.getAttribute('alt') || '';
  const added = ctx && ctx.resources ? ctx.resources.addImage(src) : null;
  if (!added) {
    // Remote/unembeddable image → placeholder (documented: only data: URIs embed).
    const label = alt ? `[Image: ${alt}]` : '[Image]';
    return `<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">${escapeXml(label)}</w:t></w:r>`;
  }
  const wPx = imgDimPx(img, 'width', 'width');
  const hPx = imgDimPx(img, 'height', 'height');
  const w = Math.round((Number.isFinite(wPx) ? wPx : DEFAULT_IMG_PX) * EMU_PER_PX);
  const h = Math.round((Number.isFinite(hPx) ? hPx : (Number.isFinite(wPx) ? wPx * 0.75 : DEFAULT_IMG_PX * 0.75)) * EMU_PER_PX);
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

/** A <w:p> with optional pPr style/numbering and the element's inline runs. */
function para(el, opts = {}) {
  const pPr = [];
  if (opts.style) pPr.push(`<w:pStyle w:val="${opts.style}"/>`);
  if (opts.numId != null) {
    pPr.push(`<w:numPr><w:ilvl w:val="${opts.ilvl || 0}"/><w:numId w:val="${opts.numId}"/></w:numPr>`);
  }
  const props = pPr.length ? `<w:pPr>${pPr.join('')}</w:pPr>` : '';
  const runs = inlineRuns(el, opts.baseMarks || {}, opts.ctx);
  return `<w:p>${props}${runs}</w:p>`;
}

const HEADING_STYLE = { h1: 'Heading1', h2: 'Heading2', h3: 'Heading3', h4: 'Heading4', h5: 'Heading5', h6: 'Heading6' };

/** Emit list-item paragraphs; nested lists recurse with a deeper ilvl. */
function listParas(listEl, ordered, ilvl, ctx) {
  const numId = ordered ? 2 : 1; // numbering.xml defines 1=bullet, 2=decimal
  let out = '';
  for (const li of listEl.children) {
    if (li.tagName.toLowerCase() !== 'li') continue;
    const clone = li.cloneNode(true);
    for (const sub of clone.querySelectorAll(':scope > ul, :scope > ol')) sub.remove();
    out += para(clone, { numId, ilvl, ctx });
    for (const sub of li.children) {
      const t = sub.tagName.toLowerCase();
      if (t === 'ul' || t === 'ol') out += listParas(sub, t === 'ol', ilvl + 1, ctx);
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
  if (tag === 'ul' || tag === 'ol') return listParas(el, tag === 'ol', 0, ctx);
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
  if (tag === 'table') return tableXml(el, { para, escapeXml, ctx });
  if (tag === 'figure') {
    // Embed the figure's <img> (data: URIs become a real drawing; remote → a
    // placeholder run inside imageRun), then the caption below it.
    const cap = el.querySelector('figcaption');
    const img = el.querySelector('img');
    const imgXml = img ? imageRun(img, ctx) : '';
    const capText = cap && cap.textContent.trim();
    const capPara = capText
      ? `<w:p><w:pPr><w:pStyle w:val="Caption"/></w:pPr><w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">${escapeXml(capText)}</w:t></w:r></w:p>`
      : '';
    return `<w:p>${imgXml}</w:p>${capPara}`;
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
 * @returns {string} the <w:body> inner XML
 */
export function bodyXml(html, doc, collector) {
  const tmp = doc.createElement('div');
  tmp.innerHTML = typeof html === 'string' ? html : '';
  let drawingId = 0;
  const ctx = {
    resources: collector || null,
    nextDrawingId: () => (drawingId += 1),
  };
  let out = '';
  for (const child of tmp.children) out += blockXml(child, ctx);
  // Word requires at least one block; guarantee a paragraph.
  return out || '<w:p/>';
}
