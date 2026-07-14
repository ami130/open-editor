/**
 * mention-detect.js — Phase 16.6.3: pure trigger-detection logic.
 *
 * Unlike the slash-command trigger (which only fires at the very start of an
 * empty block), "@" must work mid-sentence ("cc " + "@name"), so this looks
 * backward from the caret within the SAME text node for the nearest "@" that
 * starts a mention token — not preceded by a non-space/non-start character
 * (so an email-like "user@host" does not trigger), and containing no
 * whitespace between "@" and the caret (a space cancels mention mode).
 */
export function detectMentionTrigger(node, offset) {
  if (!node || node.nodeType !== 3) return null;
  const text = node.nodeValue.slice(0, offset);
  const at = text.lastIndexOf('@');
  if (at === -1) return null;
  const query = text.slice(at + 1);
  if (/\s/.test(query)) return null; // whitespace after '@' cancels mention mode
  const before = at > 0 ? text[at - 1] : '';
  if (before && !/\s/.test(before)) return null; // "@" must start a token (not user@host)
  return { atIndex: at, query };
}
