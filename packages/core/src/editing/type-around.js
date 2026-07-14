/**
 * type-around.js — 17.5.9: escape hatches around island blocks.
 *
 * A table/figure/embed as the FIRST or LAST block (or two islands back to
 * back) leaves no caret position outside it — the classic "table at document
 * start" trap. Hovering those edges shows a slim insert-paragraph line;
 * clicking it inserts <p><br></p> there and places the caret. Always on —
 * it renders nothing until an island edge actually needs it.
 *
 * (Jodit ships this as add-new-line; CKEditor as widget type-around.)
 */

const EDGE_PX = 14; // hover distance from an island edge that reveals the line

function isIsland(el) {
  if (!el || el.nodeType !== 1) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'table' || tag === 'figure' || el.hasAttribute('data-oe-island');
}

/** Pure: find the insertion slot for a pointer position, or null. */
export function findTypeAroundSlot(root, clientY) {
  for (const el of root.children) {
    if (!isIsland(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.height === 0) continue;
    // Above a first-block island.
    if (el === root.firstElementChild && Math.abs(clientY - r.top) <= EDGE_PX) {
      return { ref: el, where: 'before', y: r.top };
    }
    // Below a last-block island.
    if (el === root.lastElementChild && Math.abs(clientY - r.bottom) <= EDGE_PX) {
      return { ref: el, where: 'after', y: r.bottom };
    }
    // Between two adjacent islands.
    const next = el.nextElementSibling;
    if (next && isIsland(next) && Math.abs(clientY - r.bottom) <= EDGE_PX) {
      return { ref: el, where: 'after', y: r.bottom };
    }
  }
  return null;
}

/** Insert the escape paragraph at a slot and place the caret in it. */
export function insertParagraphAtSlot(editor, slot) {
  const root = editor.getEditorElement();
  const doc = root.ownerDocument;
  if (editor.history) editor.history.takeSnapshot();
  const p = doc.createElement('p');
  p.appendChild(doc.createElement('br'));
  if (slot.where === 'before') slot.ref.before(p);
  else slot.ref.after(p);
  const range = doc.createRange();
  range.setStart(p, 0);
  range.collapse(true);
  const sel = doc.getSelection && doc.getSelection();
  if (sel) { sel.removeAllRanges(); sel.addRange(range); }
  if (editor._onChangeFn) editor._onChangeFn();
  editor.emit('afterCommand', { command: 'typeAroundInsert', args: [slot.where] });
  return p;
}

/** Wire the hover affordance. Returns a destroy fn. */
export function installTypeAround(editor) {
  const root = editor.getEditorElement();
  const wrapper = editor._wrapper;
  const doc = root.ownerDocument;

  const line = doc.createElement('button');
  line.type = 'button';
  line.className = 'oe-type-around';
  line.setAttribute('aria-label', 'Insert paragraph here');
  line.setAttribute('tabindex', '-1');
  line.hidden = true;
  wrapper.appendChild(line);

  let slot = null;

  const onMove = (e) => {
    if (editor.isReadOnly && editor.isReadOnly()) return;
    slot = findTypeAroundSlot(root, e.clientY);
    if (!slot) { line.hidden = true; return; }
    const wRect = wrapper.getBoundingClientRect();
    const rRect = root.getBoundingClientRect();
    line.style.top = `${slot.y - wRect.top - 1}px`;
    line.style.left = `${rRect.left - wRect.left + 4}px`;
    line.style.width = `${rRect.width - 8}px`;
    line.hidden = false;
  };
  const onLeave = () => { line.hidden = true; slot = null; };
  const onClick = (e) => {
    e.preventDefault();
    if (!slot) return;
    insertParagraphAtSlot(editor, slot);
    line.hidden = true;
    slot = null;
    root.focus();
  };

  // Listen on the WRAPPER, not the root: the line floats at the island edge
  // (often just outside the root box), and the pointer's travel toward it
  // must not hide it (root mouseleave / zone-miss both fired mid-approach and
  // made the button unclickable — caught by the e2e's hanging click). Events
  // over the line itself stop propagating, so the wrapper handler never
  // re-evaluates while the pointer is on the button.
  wrapper.addEventListener('mousemove', onMove);
  wrapper.addEventListener('mouseleave', onLeave);
  line.addEventListener('mousemove', (e) => e.stopPropagation());
  line.addEventListener('click', onClick);

  return function destroy() {
    wrapper.removeEventListener('mousemove', onMove);
    wrapper.removeEventListener('mouseleave', onLeave);
    line.remove();
  };
}
