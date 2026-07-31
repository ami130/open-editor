/**
 * install-all-plugins.js — install the COMPLETE free-plugin superset.
 *
 * The feature-gating contract (Phase 2.8): a license grant can only SUPPRESS a
 * plugin (an un-granted plugin's install() is skipped), never CAUSE one to
 * exist. So for "a purchased package shows EXACTLY its features" to hold, the
 * host must install every sellable plugin and let gating trim — otherwise a
 * granted plugin whose factory the host forgot to install simply never appears.
 *
 * This helper is that contract in one call: pass it the editor and it installs
 * all first-party FREE plugins; gating (already wired in PluginManager.install)
 * drops the ones the license doesn't grant. The grant becomes the single thing
 * that decides what the customer sees.
 *
 * PREMIUM plugins live in separate packages (`premium/*`) and self-gate via the
 * premium runtime — the host wires those alongside this call (see DEPLOY docs).
 */
import { createImagePlugin } from './image/image-plugin.js';
import { createLinkPlugin } from './link/link-plugin.js';
import { createTablePlugin } from './table/table-plugin.js';
import { createSpellcheckPlugin } from './spellcheck/spellcheck-plugin.js';
import { createSpecialCharsPlugin } from './chars/special-chars-plugin.js';
import { createEmojiPlugin } from './emoji/emoji-plugin.js';
import { createPreviewPlugin } from './preview/preview-plugin.js';
import { createFormatPainterPlugin } from './format-painter/format-painter-plugin.js';
import { createResizeEditorPlugin } from './resize-editor/resize-editor-plugin.js';
import { createFindReplacePlugin } from './find-replace/find-replace-plugin.js';
import { createMediaPlugin } from './media/media-plugin.js';
import { createCodeBlockPlugin } from './code-block/code-block-plugin.js';
import { createSourcePlugin } from './source/source-plugin.js';
import { createSlashCommandPlugin } from './slash-command/slash-command-plugin.js';
import { createAutoformatPlugin } from './autoformat/autoformat-plugin.js';
import { createMentionsPlugin } from './mentions/mentions-plugin.js';
import { createBlockDragPlugin } from './block-drag/block-drag-plugin.js';
import { createTodoListPlugin } from './todo-list/todo-list-plugin.js';
import { createBookmarkPlugin } from './bookmark/bookmark-plugin.js';
import { createSpeechPlugin } from './speech/speech-plugin.js';
import { createHorizontalRulePlugin } from './horizontal-rule/hr-plugin.js';

/** Every first-party FREE plugin factory (the sellable-plugin superset). */
export const ALL_FREE_PLUGINS = [
  createImagePlugin, createLinkPlugin, createTablePlugin, createSpellcheckPlugin,
  createSpecialCharsPlugin, createEmojiPlugin, createPreviewPlugin,
  createFormatPainterPlugin, createResizeEditorPlugin, createFindReplacePlugin,
  createMediaPlugin, createCodeBlockPlugin, createSourcePlugin,
  createSlashCommandPlugin, createAutoformatPlugin, createMentionsPlugin,
  createBlockDragPlugin, createTodoListPlugin, createBookmarkPlugin,
  createSpeechPlugin, createHorizontalRulePlugin,
];

/**
 * Install every free plugin. Gating (PluginManager.install) skips the ones the
 * license doesn't grant, so the license alone decides what appears. Options are
 * forwarded per-factory if a factory accepts them (most take none).
 * @param {import('../editor.js').OpenEditor} editor
 */
export function installAllPlugins(editor) {
  for (const factory of ALL_FREE_PLUGINS) {
    editor.plugins.install(factory());
  }
  return editor;
}
