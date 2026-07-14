/**
 * slash-detect.test.js — Phase 16.6.1 pure trigger-detection logic.
 */
import { describe, it, expect } from 'vitest';
import { detectSlashTrigger } from '../src/plugins/slash-command/slash-detect.js';

function makeBlock(text) {
  const block = document.createElement('p');
  const textNode = document.createTextNode(text);
  block.appendChild(textNode);
  document.body.appendChild(block);
  return { block, textNode };
}

describe('detectSlashTrigger', () => {
  it('detects a bare "/" at the start of an empty block', () => {
    const { block, textNode } = makeBlock('/');
    expect(detectSlashTrigger(block, textNode, 1)).toEqual({ query: '' });
    block.remove();
  });

  it('detects "/head" and extracts the query', () => {
    const { block, textNode } = makeBlock('/head');
    expect(detectSlashTrigger(block, textNode, 5)).toEqual({ query: 'head' });
    block.remove();
  });

  it('returns null when the caret is mid-text without a leading slash', () => {
    const { block, textNode } = makeBlock('hello');
    expect(detectSlashTrigger(block, textNode, 3)).toBeNull();
    block.remove();
  });

  it('returns null when "/" is not at the very start of the block', () => {
    const { block, textNode } = makeBlock('hi /table');
    expect(detectSlashTrigger(block, textNode, 9)).toBeNull();
    block.remove();
  });

  it('returns null once a space follows the slash (cancels slash mode)', () => {
    const { block, textNode } = makeBlock('/foo bar');
    expect(detectSlashTrigger(block, textNode, 8)).toBeNull();
    block.remove();
  });

  it('returns null when there is no block, node, or a non-text node', () => {
    const { block } = makeBlock('/x');
    expect(detectSlashTrigger(null, block.firstChild, 1)).toBeNull();
    expect(detectSlashTrigger(block, null, 0)).toBeNull();
    expect(detectSlashTrigger(block, block, 0)).toBeNull(); // block itself, not a text node
    block.remove();
  });

  it('returns null when the text node is not the block\'s first child (slash after another node)', () => {
    const block = document.createElement('p');
    const img = document.createElement('img');
    const textNode = document.createTextNode('/table');
    block.appendChild(img);
    block.appendChild(textNode);
    document.body.appendChild(block);
    expect(detectSlashTrigger(block, textNode, 6)).toBeNull();
    block.remove();
  });

  it('returns null when the text node does not belong to this block at all', () => {
    const { block: blockA } = makeBlock('/x');
    const { textNode: textB } = makeBlock('/y');
    expect(detectSlashTrigger(blockA, textB, 2)).toBeNull();
    blockA.remove();
  });
});
