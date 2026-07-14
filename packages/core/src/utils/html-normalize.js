/**
 * HTML output normalization helpers.
 * Applied to innerHTML before returning from getHTML() to produce clean,
 * canonical markup — <b>→<strong>, empty <p> gets <br>, &nbsp; → space.
 */

export function normalizeOutputHTML(html, doc) {
  const tmp = doc.createElement('div');
  tmp.innerHTML = html;
  normalizeNode(tmp);
  // Strip zero-width chars unconditionally — ZWSP/ZWNJ/ZWJ/word-joiner/BOM
  // inserted by the pending-format path must never survive serialized output,
  // regardless of whether the sanitizer is enabled (sanitize:false config path).
  return tmp.innerHTML.replace(/[\u200B\u200C\u2060\uFEFF]/g, '').replace(/\u200D/g, '');
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
