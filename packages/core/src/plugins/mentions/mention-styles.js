import { injectStyleOnce } from '../../utils/inject-style.js';

const STYLE_ID = 'oe-mention-styles';

export const MENTION_CSS = `
.oe-editor .oe-mention {
  display: inline;
  padding: 1px 4px;
  border-radius: var(--oe-radius-sm);
  background: var(--oe-active-bg);
  color: var(--oe-primary);
  font-weight: 500;
  cursor: default;
}
`;

export function injectMentionStyles(doc) {
  injectStyleOnce(doc, STYLE_ID, MENTION_CSS);
}
