import { injectStyleOnce } from '../../utils/inject-style.js';
/**
 * todo-list-styles.js — CSS-drawn checkbox for to-do list items (16.7.3).
 * CSS files are exempt from the 300-line source limit.
 */
const STYLE_ID = 'oe-todo-list-styles';

const CSS = `
ul[data-todo-list] {
  list-style: none;
  padding-left: 0;
}
li[data-todo] {
  position: relative;
  padding-left: 26px;
  cursor: default;
  outline: none;
}
li[data-todo]::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.15em;
  width: 16px;
  height: 16px;
  border: 2px solid var(--oe-border-strong);
  border-radius: 4px;
  background: var(--oe-bg);
  cursor: pointer;
  box-sizing: border-box;
  transition: background 0.12s, border-color 0.12s;
}
li[data-todo][data-checked="true"]::before {
  background: var(--oe-primary);
  border-color: var(--oe-primary);
}
li[data-todo][data-checked="true"]::after {
  content: '';
  position: absolute;
  left: 5px;
  top: 0.35em;
  width: 5px;
  height: 9px;
  border: solid var(--oe-primary-fg);
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
  pointer-events: none;
}
li[data-todo][data-checked="true"] {
  color: var(--oe-panel-fg-muted);
  text-decoration: line-through;
}
li[data-todo]:focus-visible::before {
  outline: 2px solid var(--oe-focus-ring);
  outline-offset: 2px;
}
`;

export function injectTodoListStyles(doc) {
  injectStyleOnce(doc, STYLE_ID, CSS);
}
