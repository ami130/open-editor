/**
 * HTML output normalization helpers.
 * Applied to innerHTML before returning from getHTML() to produce clean,
 * canonical markup — <b>→<strong>, empty <p> gets <br>, &nbsp; → space.
 */

export function normalizeOutputHTML(html, doc) {
  const tmp = doc.createElement('div');
  tmp.innerHTML = html;
  normalizeNode(tmp);
  // Drop empty formatting husks left by the pending-format path (apply bold/
  // color/font at a caret, then don't type -> an empty <strong>/<span style>).
  // Runs on this DETACHED copy only, so the live editing DOM keeps its pending
  // span while the caret is inside it. Treats a ZWSP-only element as empty.
  pruneEmptyFormatHusks(tmp);
  // Strip zero-width chars unconditionally — ZWSP/ZWNJ/ZWJ/word-joiner/BOM
  // inserted by the pending-format path must never survive serialized output,
  // regardless of whether the sanitizer is enabled (sanitize:false config path).
  return tmp.innerHTML.replace(/[\u200B\u200C\u2060\uFEFF]/g, '').replace(/\u200D/g, '');
}

// Inline formatting elements whose ONLY purpose is styling — an empty one
// carries no content and is safe to drop. Anchors/bookmarks (<a>, or anything
// with an id) and void/media elements are preserved by the guards below.
const FORMAT_INLINE = new Set(['strong','b','em','i','u','s','del','strike',
  'sup','sub','code','span','mark','abbr','cite','q','small','ins','font']);
const ZERO_WIDTH_RE = /[\u200B\u200C\u2060\uFEFF]/g;   // ZWJ handled separately (no-misleading-character-class)
const ZWJ_RE = /\u200D/g;

// Recursively remove empty formatting-only inline elements, bottom-up so an
// element that becomes empty after its children are pruned is caught too.
function pruneEmptyFormatHusks(node) {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType !== 1) continue;
    pruneEmptyFormatHusks(child);                       // children first
    const tag = child.tagName.toLowerCase();
    if (!FORMAT_INLINE.has(tag)) continue;              // only formatting tags
    if (child.id) continue;                             // keep anchored elements
    if (child.querySelector('img,hr,br,video,audio,iframe,embed,object,svg,canvas,picture')) continue;
    const text = (child.textContent || '').replace(ZERO_WIDTH_RE, '').replace(ZWJ_RE, '');
    if (text === '' && child.childElementCount === 0) child.parentNode.removeChild(child);
  }
}

function normalizeNode(node) {
  const children = Array.from(node.childNodes);
  for (const child of children) {
    if (child.nodeType !== 1) continue;
    const tag = child.tagName.toLowerCase();

    // 2.21 — <b> → <strong>, <i> → <em>
    if (tag === 'b') {
      const strong = node.ownerDocument.createElement('strong');
      while (child.firstChild) strong.appendChild(child.firstChild);
      for (const attr of Array.from(child.attributes)) {
        strong.setAttribute(attr.name, attr.value);
      }
      node.replaceChild(strong, child);
      normalizeNode(strong);
      continue;
    }
    if (tag === 'i') {
      const em = node.ownerDocument.createElement('em');
      while (child.firstChild) em.appendChild(child.firstChild);
      for (const attr of Array.from(child.attributes)) {
        em.setAttribute(attr.name, attr.value);
      }
      node.replaceChild(em, child);
      normalizeNode(em);
      continue;
    }

    // 2.21 — <strike> / <del> → <s> (canonical strikethrough element)
    if (tag === 'strike' || tag === 'del') {
      const s = node.ownerDocument.createElement('s');
      while (child.firstChild) s.appendChild(child.firstChild);
      for (const attr of Array.from(child.attributes)) {
        s.setAttribute(attr.name, attr.value);
      }
      node.replaceChild(s, child);
      normalizeNode(s);
      continue;
    }

    // Image islands: strip editing-only STATE classes that must never ship in
    // saved output. `oe-figure--selected` is toggled on click/focus and would
    // otherwise bake a selection ring into published content (the alignment
    // classes oe-figure--left/right/center/inline ARE content and are kept).
    // Runs on the detached serialization copy only, so the live DOM keeps its
    // selection class while editing.
    if (tag === 'figure' && child.classList) {
      child.classList.remove('oe-figure--selected');
      if (child.getAttribute('class') === '') child.removeAttribute('class');
    }

    // 2.20 — empty <p> gets a <br> inside for canonical cross-browser form.
    // M-02 fix: check textContent (not innerHTML.trim()) so that <p> elements
    // containing only empty inline wrappers like <span></span> are also caught.
    // Those render as zero-height lines in browsers without a <br> inside.
    if (tag === 'p') {
      const hasText = (child.textContent || '').trim() !== '';
      const hasMedia = child.querySelector('img,hr,br,video,audio,iframe,embed,object,svg');
      if (!hasText && !hasMedia) {
        child.innerHTML = '<br>';
        continue;
      }
    }

    // 2.19 — &nbsp; → regular space, but NOT inside <pre>
    if (tag !== 'pre') {
      replaceNbspInTextNodes(child);
    }

    normalizeNode(child);
  }
}

function replaceNbspInTextNodes(node) {
  const walker = node.ownerDocument.createTreeWalker(node, 4 /* NodeFilter.SHOW_TEXT */);
  let textNode;
  while ((textNode = walker.nextNode())) {
    let ancestor = textNode.parentNode;
    let inPre = false;
    while (ancestor && ancestor !== node) {
      if (ancestor.tagName && ancestor.tagName.toLowerCase() === 'pre') {
        inPre = true;
        break;
      }
      ancestor = ancestor.parentNode;
    }
    if (!inPre) {
      textNode.nodeValue = textNode.nodeValue.replace(/\u00a0/g, ' ');
    }
  }
}
