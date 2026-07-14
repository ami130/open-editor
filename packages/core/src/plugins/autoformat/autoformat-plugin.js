/**
 * autoformat-plugin.js — Phase 16.6.2: Markdown-style typing shortcuts.
 *
 * Runs on every `input`. Pattern matching is pure (autoformat-patterns.js);
 * this file only does the DOM surgery: strip the marker characters, select the
 * resulting content, and run it through the normal command layer so undo/redo,
 * beforeCommand/afterCommand, and history snapshots all behave exactly as a
 * toolbar click would. Config-gated via `config.autoformat` (default true).
 *
 * Implements { name, install, destroy }.
 */
import { getParentBlock } from '../../selection/range-utils.js';
import { matchBlockPattern, matchInlinePattern } from './autoformat-patterns.js';

const BLOCK_TAGS_ALLOWING_AUTOFORMAT = new Set(['p', 'div']);

export function createAutoformatPlugin() {
  return {
    name: 'autoformat',
    _editor: null,

    install(editor) {
      this._editor = editor;
      this._onInput = () => this._check();
      editor.on('input', this._onInput);
    },

    destroy() {
      if (this._editor) this._editor.off('input', this._onInput);
      this._editor = null;
    },

    _check() {
      const editor = this._editor;
      if (!editor || editor._config.autoformat === false) return;
      if (editor._isComposing) return; // never mid-IME-composition
      const info = editor.selection && editor.selection.get();
      if (!info || !info.collapsed || !info.startNode || info.startNode.nodeType !== 3) return;

      if (this._tryBlockPattern(editor, info)) return;
      this._tryInlinePattern(editor, info);
    },

    _tryBlockPattern(editor, info) {
      const node = info.startNode;
      const block = getParentBlock(node, editor.getEditorElement());
      // Only fire at the true start of a plain paragraph (never inside a
      // heading/list/quote already, and never mid-block) — matches the
      // slash-command trigger's "first child of block" safety rule.
      if (!block || !BLOCK_TAGS_ALLOWING_AUTOFORMAT.has(block.tagName.toLowerCase())) return false;
      if (block.firstChild !== node) return false;
      const text = node.nodeValue.slice(0, info.startOffset);
      const match = matchBlockPattern(text);
      if (!match) return false;

      // Remove the marker text, then apply the block command to the now-clean block.
      node.nodeValue = node.nodeValue.slice(match.matchLength);
      editor.selection.set(node, 0, node, 0);
      editor.commands.execute(match.command);
      if (editor._onChangeFn) editor._onChangeFn();
      return true;
    },

    _tryInlinePattern(editor, info) {
      const node = info.startNode;
      const text = node.nodeValue.slice(0, info.startOffset);
      const match = matchInlinePattern(text);
      if (!match) return false;

      const tailAfterCaret = node.nodeValue.slice(info.startOffset);

      // Rebuild the text node WITHOUT the marker characters, keeping everything
      // else (text before the open marker, the inner content, and whatever
      // follows the caret) exactly in place.
      const before = node.nodeValue.slice(0, match.start);
      const inner = node.nodeValue.slice(match.contentStart, match.contentEnd);
      node.nodeValue = before + inner + tailAfterCaret;

      const newContentStart = before.length;
      const newContentEnd = newContentStart + inner.length;
      editor.selection.set(node, newContentStart, node, newContentEnd);
      editor.commands.execute(match.command);
      editor.selection.set(node, newContentEnd, node, newContentEnd);
      if (editor._onChangeFn) editor._onChangeFn();
      return true;
    },
  };
}

export const autoformatPlugin = createAutoformatPlugin();
