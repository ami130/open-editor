import { injectStyleOnce } from '../../utils/inject-style.js';

const STYLE_ID = 'oe-block-drag-styles';

export const BLOCK_DRAG_CSS = `
.oe-block-handle {
  position: absolute;
  width: 18px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--oe-radius-sm);
  color: var(--oe-panel-fg-faint);
  cursor: grab;
  opacity: 0;
  transition: opacity 0.1s ease, background 0.1s ease;
  z-index: 5;
}
.oe-block-handle:hover,
.oe-block-handle--visible {
  opacity: 1;
  background: var(--oe-chrome-hover);
}
.oe-block-handle:active { cursor: grabbing; }
.oe-block-handle svg { width: 14px; height: 14px; pointer-events: none; }

.oe-block-drop-indicator {
  position: absolute;
  height: 3px;
  border-radius: 2px;
  background: var(--oe-primary);
  pointer-events: none;
  z-index: 6;
}

.oe-editor--block-dragging,
.oe-editor--block-dragging * {
  user-select: none;
}
.oe-block-drag-source { opacity: 0.4; }
`;

export function injectBlockDragStyles(doc) {
  injectStyleOnce(doc, STYLE_ID, BLOCK_DRAG_CSS);
}
