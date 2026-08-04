/**
 * Heading commands (h1–h6). Split out of block-commands.js to keep it within the
 * 300-line limit. Delegates to applyFormatBlock/currentInnerBlock (re-exported
 * from block-commands.js); the block↔heading import is a call-time cycle (safe).
 */

import { CommandManager } from './command-manager.js';
import { applyFormatBlock, currentInnerBlock } from './block-commands.js';

function makeHeadingCommand(level) {
  const tag = `h${level}`;
  return {
    execute(editor) {
      applyFormatBlock(editor, tag);
      return CommandManager.SKIP_RESTORE;
    },
    isActive(editor) {
      const block = currentInnerBlock(editor);
      return !!block && block.tagName.toLowerCase() === tag;
    },
  };
}

export const h1Command = makeHeadingCommand(1);
export const h2Command = makeHeadingCommand(2);
export const h3Command = makeHeadingCommand(3);
export const h4Command = makeHeadingCommand(4);
export const h5Command = makeHeadingCommand(5);
export const h6Command = makeHeadingCommand(6);
