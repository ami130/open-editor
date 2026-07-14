/**
 * setupCommands — registers all built-in commands and keyboard shortcuts
 * on the editor's CommandManager and ShortcutManager.
 *
 * Called once during editor._init(). Extracted from editor.js to keep that
 * file under the 300-line limit.
 */

import {
  boldCommand, italicCommand, underlineCommand, strikethroughCommand,
  superscriptCommand, subscriptCommand, inlineCodeCommand,
  removeFormatCommand,
} from './text-commands.js';
import {
  selectAllCommand, cutCommand, copyAsPlainTextCommand,
  insertHTMLCommand, insertTextCommand, insertHorizontalRuleCommand,
  insertNonBreakingSpaceCommand,
} from './insert-commands.js';
import {
  fontSizeCommand, fontFamilyCommand, lineHeightCommand, letterSpacingCommand,
  textIndentCommand, textTransformCommand, fontWeightCommand,
  overlineCommand, dottedUnderlineCommand,
} from './style-commands.js';
import {
  textColorCommand, backgroundColorCommand,
  removeTextColorCommand, removeBackgroundColorCommand,
} from './color-commands.js';
import {
  paragraphCommand, h1Command, h2Command, h3Command, h4Command, h5Command, h6Command,
  blockquoteCommand, preCommand,
} from './block-commands.js';
import {
  alignLeftCommand, alignCenterCommand, alignRightCommand, alignJustifyCommand,
  writingModeCommand,
} from './align-commands.js';
import {
  ulCommand, olCommand, indentCommand, outdentCommand,
} from './list-commands.js';
import {
  listStyleTypeCommand, setListStartCommand, definitionListCommand,
} from './list-extra-commands.js';
import {
  blockIndentCommand, blockOutdentCommand,
} from './block-indent-commands.js';
import { CommandManager } from './command-manager.js';

export function setupCommands(editor) {
  editor.commands = new CommandManager(editor);

  // ── Text commands ──
  editor.commands.register('bold',                  boldCommand);
  editor.commands.register('italic',                italicCommand);
  editor.commands.register('underline',             underlineCommand);
  editor.commands.register('strikethrough',         strikethroughCommand);
  editor.commands.register('superscript',           superscriptCommand);
  editor.commands.register('subscript',             subscriptCommand);
  editor.commands.register('inlineCode',            inlineCodeCommand);
  editor.commands.register('removeFormat',          removeFormatCommand);
  editor.commands.register('selectAll',             selectAllCommand);
  editor.commands.register('cut',                   cutCommand);
  editor.commands.register('copyAsPlainText',       copyAsPlainTextCommand);
  editor.commands.register('insertHTML',            insertHTMLCommand);
  editor.commands.register('insertText',            insertTextCommand);
  editor.commands.register('insertHorizontalRule',  insertHorizontalRuleCommand);
  editor.commands.register('insertNonBreakingSpace',insertNonBreakingSpaceCommand);
  editor.commands.register('fontSize',              fontSizeCommand);
  editor.commands.register('fontFamily',            fontFamilyCommand);
  editor.commands.register('lineHeight',            lineHeightCommand);
  editor.commands.register('letterSpacing',         letterSpacingCommand);
  editor.commands.register('textIndent',            textIndentCommand);
  editor.commands.register('textTransform',         textTransformCommand);
  editor.commands.register('fontWeight',            fontWeightCommand);
  editor.commands.register('textColor',             textColorCommand);
  editor.commands.register('backgroundColor',       backgroundColorCommand);
  editor.commands.register('removeTextColor',        removeTextColorCommand);
  editor.commands.register('removeBackgroundColor',  removeBackgroundColorCommand);
  editor.commands.register('overline',              overlineCommand);
  editor.commands.register('dottedUnderline',       dottedUnderlineCommand);

  // ── Block commands ──
  editor.commands.register('paragraph',     paragraphCommand);
  editor.commands.register('h1',            h1Command);
  editor.commands.register('h2',            h2Command);
  editor.commands.register('h3',            h3Command);
  editor.commands.register('h4',            h4Command);
  editor.commands.register('h5',            h5Command);
  editor.commands.register('h6',            h6Command);
  editor.commands.register('blockquote',    blockquoteCommand);
  editor.commands.register('pre',           preCommand);
  editor.commands.register('alignLeft',     alignLeftCommand);
  editor.commands.register('alignCenter',   alignCenterCommand);
  editor.commands.register('alignRight',    alignRightCommand);
  editor.commands.register('alignJustify',  alignJustifyCommand);
  editor.commands.register('writingMode',   writingModeCommand);

  // ── List commands ──
  editor.commands.register('ul',              ulCommand);
  editor.commands.register('ol',              olCommand);
  editor.commands.register('indent',          indentCommand);
  editor.commands.register('outdent',         outdentCommand);
  editor.commands.register('listStyleType',   listStyleTypeCommand);
  editor.commands.register('setListStart',    setListStartCommand);
  editor.commands.register('definitionList',  definitionListCommand);
  editor.commands.register('blockIndent',     blockIndentCommand);
  editor.commands.register('blockOutdent',    blockOutdentCommand);

  // ── Undo / Redo (delegate to HistoryManager) ──
  // SKIP_RESTORE: _applySnapshot restores the snapshot's own cursor position;
  // allowing CommandManager to then restore the pre-undo bookmark would clobber it.
  editor.commands.register('undo', {
    execute: (ed) => { if (ed.history) ed.history.undo(); return CommandManager.SKIP_RESTORE; },
    isEnabled: (ed) => !!ed.history && ed.history.canUndo(),
  });
  editor.commands.register('redo', {
    execute: (ed) => { if (ed.history) ed.history.redo(); return CommandManager.SKIP_RESTORE; },
    isEnabled: (ed) => !!ed.history && ed.history.canRedo(),
  });

  // ── Keyboard shortcuts ──
  editor.shortcuts.register('ctrl+b',       'bold',           'Bold');
  editor.shortcuts.register('meta+b',       'bold',           'Bold');
  editor.shortcuts.register('ctrl+i',       'italic',         'Italic');
  editor.shortcuts.register('meta+i',       'italic',         'Italic');
  editor.shortcuts.register('ctrl+u',       'underline',      'Underline');
  editor.shortcuts.register('meta+u',       'underline',      'Underline');
  editor.shortcuts.register('ctrl+shift+x', 'strikethrough',  'Strikethrough');
  editor.shortcuts.register('meta+shift+x', 'strikethrough',  'Strikethrough');
  editor.shortcuts.register('ctrl+a',       'selectAll',      'Select all');
  editor.shortcuts.register('meta+a',       'selectAll',      'Select all');
  editor.shortcuts.register('ctrl+z',       'undo',           'Undo');
  editor.shortcuts.register('meta+z',       'undo',           'Undo');
  editor.shortcuts.register('ctrl+y',       'redo',           'Redo');
  editor.shortcuts.register('meta+y',       'redo',           'Redo');
  editor.shortcuts.register('ctrl+shift+z', 'redo',           'Redo');
  editor.shortcuts.register('meta+shift+z', 'redo',           'Redo');

  // Route shortcut events → command execution
  editor.on('shortcut', (descriptor) => {
    if (editor.commands) editor.commands.execute(descriptor.command);
  });
}
