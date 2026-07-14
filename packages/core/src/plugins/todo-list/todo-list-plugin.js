/**
 * todo-list-plugin.js — Phase 16.7.3: to-do lists (checkbox list items).
 *
 * Toolbar button wraps the current block(s) into a fresh <ul data-todo-list>
 * of unchecked items — a deliberately simple, separate command from the
 * regular bulleted/numbered list toggle (list-commands.js), not integrated
 * into its toggle/convert/merge modes. `[ ] `/`[x] ` + space autoformat
 * triggers the same insertion (autoformat-plugin.js reuses this plugin's
 * exported command via editor.commands.execute).
 *
 * Because a to-do item IS a real <li> (just with data-todo/data-checked
 * markers), the EXISTING list infrastructure already handles it for free:
 * Tab/Shift+Tab nesting (list-dom-indent.js), Enter-exit-on-empty-item
 * (list-keyboard.js's handleListEnter), and the browser's own native
 * Enter-splits-a-non-empty-<li> behavior. This plugin only adds: the
 * checkbox click/keyboard toggle, and an `input`-driven normalizer that
 * resets a freshly-split item back to unchecked (the browser's native split
 * otherwise clones data-checked="true" onto the new sibling).
 *
 * Implements { name, install, destroy, getToolbarButtons, onKeyDown }.
 */
import { getParentBlock } from '../../selection/range-utils.js';
import { CommandManager } from '../../commands/command-manager.js';
import { injectTodoListStyles } from './todo-list-styles.js';
import {
  createTodoList, isTodoItem, toggleChecked, normalizeTodoList, markAsTodoItem,
} from './todo-list-dom.js';

const TODO_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <rect x="3" y="3" width="18" height="18" rx="3"/><path d="m8 12 3 3 5-6"/>
</svg>`;

/** Insert a fresh to-do list at the caret's current block, or convert it. */
export function insertTodoList(editor) {
  const root = editor.getEditorElement();
  const doc = editor._iframeDoc || document;
  const info = editor.selection && editor.selection.get();
  if (!info || !info.startNode) return false;

  const block = getParentBlock(info.startNode, root);
  if (!block || block.tagName === 'LI') return false; // don't nest a fresh list inside an existing li

  const ul = createTodoList(doc);
  const li = ul.firstElementChild;
  // Carry over the block's own text (matches the regular list-toggle's
  // "wrap only the single block the cursor is in" behavior for a collapsed
  // caret in a plain paragraph). autoformat-plugin.js strips the trigger
  // marker text but LEAVES the (now-empty-string) text node in place, so
  // `block.firstChild` is often a truthy-but-empty text node — checking
  // firstChild alone would then skip the <br> fallback below, producing a
  // genuinely childless <li> that a real browser cannot treat as a typing
  // target at all (observed live: typing right after creation landed as a
  // stray <p> outside the list instead of inside the empty item).
  const hasRealContent = block.textContent !== '' || block.querySelector('img, iframe, br, [data-oe-island]');
  while (block.firstChild) li.appendChild(block.firstChild);
  if (!hasRealContent) {
    li.innerHTML = '';
    li.appendChild(doc.createElement('br'));
  }

  block.parentNode.replaceChild(ul, block);
  editor.selection.set(li, 0);
  return true;
}

export function createTodoListPlugin() {
  return {
    name: 'todoList',
    _editor: null,
    _onInput: null,
    _onClick: null,
    _armedSplitLi: null,

    install(editor) {
      this._editor = editor;
      const doc = (typeof document !== 'undefined') ? document : null;
      if (doc) injectTodoListStyles(doc);

      // Registered so autoformat-plugin.js's `[ ] `/`[x] ` block-pattern
      // trigger can invoke it the same way any other block command runs
      // (editor.commands.execute) — same shared registry every plugin uses
      // (see link-plugin.js's 'unlink' for the established precedent).
      editor.commands.register('todoList', {
        execute: (ed) => { insertTodoList(ed); return CommandManager.SKIP_RESTORE; },
      });
      editor.commands.register('todoListChecked', {
        execute: (ed) => { insertCheckedTodoList(ed); return CommandManager.SKIP_RESTORE; },
      });

      // Keep every to-do item's checked-state markers consistent after any
      // edit (data-todo missing from an item moved in via indent/outdent).
      const normalizeAll = () => {
        const root = editor.getEditorElement();
        if (!root) return;
        for (const ul of root.querySelectorAll('ul[data-todo-list]')) normalizeTodoList(ul);
      };
      this._onInput = () => {
        normalizeAll();
        // A native browser Enter-split of a checked, non-empty to-do <li>
        // clones ALL its attributes onto the new sibling, including
        // data-checked="true" — a freshly split item must always start
        // unchecked (armed by onKeyDown right before the split happens,
        // since by the time `input` fires the split has ALREADY occurred
        // and there is no reliable way to tell "just split from a checked
        // item" apart from "user checked this pre-existing item" otherwise).
        if (this._armedSplitLi) {
          const armed = this._armedSplitLi;
          this._armedSplitLi = null;
          const newSibling = armed.nextElementSibling;
          if (newSibling && isTodoItem(newSibling)) {
            markAsTodoItem(newSibling, false);
            // Firefox strands the post-split caret against the cloned
            // contenteditable=false box (typed text vanished — caught live).
            // Re-place it deterministically at the item's content position.
            const doc = newSibling.ownerDocument;
            let anchor = newSibling.querySelector(':scope > br');
            if (!anchor && newSibling.textContent === '') {
              anchor = doc.createElement('br');
              newSibling.appendChild(anchor);
            }
            const range = doc.createRange();
            if (anchor) range.setStartBefore(anchor);
            else range.setStart(newSibling, newSibling.childNodes.length);
            range.collapse(true);
            const sel = doc.getSelection && doc.getSelection();
            if (sel) { sel.removeAllRanges(); sel.addRange(range); }
          }
        }
      };
      // 17.5-sweep: normalize on programmatic loads too — without this, a
      // reloaded document has data-* but NO checkbox semantics until the
      // first keystroke (same bug class as the 16.7.9 status-bar setHTML fix).
      this._onSetHTML = () => normalizeAll();
      editor.on('input', this._onInput);
      editor.on('setHTML', this._onSetHTML);

      // Click the checkbox area (the ::before pseudo-element) toggles it.
      // A click anywhere else in the li (the text) is normal caret placement.
      this._onClick = (e) => {
        // Direct hit on the semantic carrier toggles immediately.
        const box = e.target && e.target.closest ? e.target.closest('.oe-todo-check') : null;
        const li = box ? box.closest('li[data-todo]')
          : (e.target && e.target.closest ? e.target.closest('li[data-todo]') : null);
        if (!li) return;
        const rect = li.getBoundingClientRect();
        // The checkbox glyph occupies the leftmost ~20px (padding-left: 26px
        // in todo-list-styles.js) — only a click there toggles; clicking the
        // text itself must place the caret normally, not toggle the box.
        if (e.clientX - rect.left > 20) return;
        e.preventDefault();
        editor.history && editor.history.takeSnapshot();
        toggleChecked(li);
        editor.emit('afterCommand', { command: 'toggleTodoItem', args: [] });
        if (editor._onChangeFn) editor._onChangeFn();
      };
      editor.getEditorElement().addEventListener('mousedown', this._onClick);
    },

    destroy() {
      if (this._editor) {
        this._editor.off('input', this._onInput);
        this._editor.off('setHTML', this._onSetHTML);
        const root = this._editor.getEditorElement();
        if (root) root.removeEventListener('mousedown', this._onClick);
        this._editor.commands.unregister('todoList');
        this._editor.commands.unregister('todoListChecked');
      }
      this._editor = null;
    },

    getToolbarButtons() {
      return [{
        name: 'todoList', type: 'button', icon: TODO_ICON,
        tooltip: 'To-do list',
        onClick: () => {
          const editor = this._editor;
          if (!editor) return;
          editor.history && editor.history.takeSnapshot();
          if (insertTodoList(editor)) {
            editor.emit('afterCommand', { command: 'insertTodoList', args: [] });
            if (editor._onChangeFn) editor._onChangeFn();
          }
        },
      }];
    },

    onKeyDown(e) {
      const editor = this._editor;
      if (!editor || e.key !== 'Enter') return false;
      const info = editor.selection && editor.selection.get();
      const root = editor.getEditorElement();
      const li = info && info.startNode && getParentBlock(info.startNode, root);
      if (!li || !isTodoItem(li)) return false;

      // Ctrl/Cmd+Enter toggles the current item's checked state, matching
      // CKEditor's shortcut for the same action. Consumes the key.
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        editor.history && editor.history.takeSnapshot();
        toggleChecked(li);
        editor.emit('afterCommand', { command: 'toggleTodoItem', args: [] });
        if (editor._onChangeFn) editor._onChangeFn();
        return true;
      }

      // A plain Enter on a NON-EMPTY checked item is about to be split by
      // the browser natively (this plugin doesn't preventDefault it — see
      // the file header). Arm the upcoming input handler to reset whatever
      // new sibling appears right after this li back to unchecked. An empty
      // item's Enter is handled by list-keyboard.js's handleListEnter
      // (exits the list) before this ever runs, so `isChecked` here only
      // ever fires on a genuine mid-item Enter-split.
      // 17.5-sweep: arm on EVERY todo split (was checked-only) — the armed
      // input-path also repairs Firefox's post-split caret, which gets
      // stranded against the cloned contenteditable=false box for unchecked
      // items too (typed text vanished; caught live by the Tab-nest e2e).
      this._armedSplitLi = li;
      return false; // never consume — let the existing list Enter chain run
    },
  };
}

export const todoListPlugin = createTodoListPlugin();

// Exported for autoformat-plugin.js's block-pattern dispatch (16.7.3's
// `[ ] `/`[x] ` trigger reuses the exact same insertion path as the toolbar
// button, then marks the item checked if the trigger was `[x] `).
export function insertCheckedTodoList(editor) {
  const created = insertTodoList(editor);
  if (!created) return false;
  const info = editor.selection && editor.selection.get();
  const root = editor.getEditorElement();
  const li = info && info.startNode && getParentBlock(info.startNode, root);
  if (li && isTodoItem(li)) markAsTodoItem(li, true);
  return created;
}
