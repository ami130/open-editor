/**
 * word-lists.js — Phase 12.D: reconstruct real nested <ul>/<ol> from Word's
 * flat fake-bullet list paragraphs. THIS EXCEEDS JODIT, which only deletes the
 * fake bullets (mso-list:Ignore) and leaves the items as plain paragraphs —
 * pasted Word lists never become real lists in Jodit.
 *
 * Runs AFTER 12.C (which stripped the bullet glyphs but PRESERVED the
 * `mso-list:lN levelM` marker and stamped `data-oe-list-type="ul|ol"` on each
 * list paragraph) and BEFORE 12.F normalize (which would strip the marker).
 *
 * The marker decodes as:  mso-list: l<listId> level<depth> lfo<override>
 *   • listId  — which list definition (a new listId at level 1 starts a new list)
 *   • depth   — 1-based nesting level (drives the open/close stack)
 *   • type    — ordered vs unordered, from the data-oe-list-type hint
 *
 * Algorithm: walk siblings; gather maximal runs of consecutive list paragraphs;
 * for each run build a nested list with a level-stack (deeper → open nested
 * list inside the last <li>; shallower → close back; same → append <li>), then
 * replace the run of <p>s with the built list root.
 *
 * Pure `(html, ctx?) → html`.
 */

const LEVEL_RE = /mso-list\s*:\s*l(\d+)\s+level(\d+)/i;

function getDoc(ctx) {
  if (ctx && ctx.editor && ctx.editor._iframeDoc) return ctx.editor._iframeDoc;
  return typeof document !== 'undefined' ? document : null;
}

/** If `p` is a Word list paragraph, return {listId, level, type}; else null. */
function listInfo(p) {
  if (!p || p.nodeType !== 1 || p.tagName !== 'P') return null;
  const style = p.getAttribute('style') || '';
  const m = style.match(LEVEL_RE);
  if (!m) return null;
  return {
    listId: parseInt(m[1], 10),
    level: Math.max(1, parseInt(m[2], 10)),
    type: p.getAttribute('data-oe-list-type') === 'ol' ? 'ol' : 'ul',
  };
}

/** Build an <li> from a list paragraph: move its inline content, drop markers. */
function makeLi(p, doc) {
  const li = doc.createElement('li');
  while (p.firstChild) li.appendChild(p.firstChild);
  // Word leaves leading whitespace where the bullet+tab span was removed.
  // Drop a fully-blank leading text node, or trim the leading space off a
  // text node that also holds content ("  First item" → "First item").
  while (li.firstChild && li.firstChild.nodeType === 3) {
    const trimmed = li.firstChild.nodeValue.replace(/^[\s\u00A0]+/, '');
    if (trimmed === '') { li.removeChild(li.firstChild); continue; }
    li.firstChild.nodeValue = trimmed;
    break;
  }
  return li;
}

/**
 * Build a nested list DOM from a run of {p, info} items (all consecutive list
 * paragraphs of ONE Word list). Returns the outermost list element.
 *
 * Each list level's ordered/unordered type comes from the FIRST real item that
 * lands at that level (not from items[0] and not from whichever item is current
 * during a phantom descent — those were the D1 bugs). A phantom intermediate
 * level opened only because an item skipped levels has no own item, so it
 * defaults to 'ul' until a real item at that level fixes its type.
 */
function buildList(items, doc) {
  // #5 — drop bullet-only paragraphs (no text, no media): after 12.C removed the
  // fake bullet glyph they carry nothing, and an empty <li> is pure noise.
  items = items.filter(({ p }) =>
    p.textContent.replace(/[\s ]/g, '') !== '' || p.querySelector('img,video,iframe,br,table'));
  if (items.length === 0) return null;

  // Determine the root (level-1) type from the first item actually at level 1;
  // if the run never has a level-1 item (starts nested), default to 'ul'.
  const firstL1 = items.find((it) => it.info.level === 1);
  const root = doc.createElement(firstL1 ? firstL1.info.type : 'ul');
  const stack = [root]; // stack[k] = the list element at depth k+1

  for (const { p, info } of items) {
    const depth = info.level; // 1-based
    // Descend: open nested lists until the stack reaches `depth`. The list AT
    // `depth` gets this item's own type; phantom intermediate levels get 'ul'.
    while (stack.length < depth) {
      const parentList = stack[stack.length - 1];
      let host = parentList.lastElementChild;
      if (!host) { host = doc.createElement('li'); parentList.appendChild(host); }
      const isTargetLevel = stack.length + 1 === depth;
      const nested = doc.createElement(isTargetLevel ? info.type : 'ul');
      host.appendChild(nested);
      stack.push(nested);
    }
    // Ascend: close nested lists until the stack is at `depth`.
    while (stack.length > depth) stack.pop();

    stack[stack.length - 1].appendChild(makeLi(p, doc));
  }
  return root;
}

export function reconstructWordLists(html, ctx) {
  if (typeof html !== 'string' || html === '') return html;
  const doc = getDoc(ctx);
  if (!doc) return html;

  const root = doc.createElement('div');
  root.innerHTML = html;

  // Walk top-level children, gathering maximal runs of list paragraphs.
  let node = root.firstChild;
  while (node) {
    const info = listInfo(node);
    if (!info) { node = node.nextSibling; continue; }

    // Collect the consecutive run (skipping pure-whitespace text between <p>s).
    // A run is ONE Word list: a level-1 item that introduces a DIFFERENT listId
    // than the run's own level-1 listId starts a new list, so it ends this run
    // (fixes D2 — distinct adjacent lists were being fused and their type lost).
    const items = [];
    let cur = node;
    let lastReal = node;
    const runListId = info.listId;
    while (cur) {
      const ci = listInfo(cur);
      if (ci) {
        if (ci.level === 1 && items.length && ci.listId !== runListId) break; // new list
        items.push({ p: cur, info: ci }); lastReal = cur; cur = cur.nextSibling; continue;
      }
      if (cur.nodeType === 3 && !cur.nodeValue.trim()) { cur = cur.nextSibling; continue; }
      break; // a real non-list node ends the run
    }

    const listEl = buildList(items, doc);
    const stop = lastReal.nextSibling;
    if (listEl) root.insertBefore(listEl, node);
    // Remove the consumed paragraphs (and whitespace between them).
    let del = node;
    while (del && del !== stop) { const nx = del.nextSibling; del.remove(); del = nx; }
    // Continue after the inserted list, or from where the run ended if it was
    // all-empty (no list inserted).
    node = listEl ? listEl.nextSibling : stop;
  }

  return root.innerHTML;
}
