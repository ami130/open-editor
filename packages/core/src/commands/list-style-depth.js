/**
 * list-style-depth.js — 16.7.1: auto-vary a list's marker by nesting depth,
 * matching CKEditor's disc→circle→square (and an ordered-list equivalent)
 * cycling. Pure functions, no DOM mutation — indentLi (list-dom-indent.js)
 * calls these and assigns the result to a NEW sublist's listStyleType.
 */
import { isList } from './list-dom.js';

// Same value sets the toolbar's style picker already exposes
// (ui/toolbar/toolbar-config.js UL_STYLE_OPTIONS/OL_STYLE_OPTIONS) — kept as
// a local copy here since importing the toolbar module from a commands
// module would be a layering inversion.
const UL_CYCLE = ['disc', 'circle', 'square'];
const OL_CYCLE = ['decimal', 'lower-alpha', 'lower-roman'];

/**
 * Count how many list ancestors (inclusive of `list` itself) sit between it
 * and the editor root — depth 1 is a top-level list, depth 2 is one level
 * nested, etc.
 */
export function listDepth(list) {
  let depth = 0;
  let node = list;
  while (node && node.nodeType === 1) {
    if (isList(node)) depth++;
    node = node.parentNode;
  }
  return depth;
}

/** The listStyleType value for a list of tag `tag` at nesting `depth` (1-based). */
export function markerForDepth(tag, depth) {
  const cycle = tag === 'ol' ? OL_CYCLE : UL_CYCLE;
  const index = Math.max(0, depth - 1) % cycle.length;
  return cycle[index];
}
