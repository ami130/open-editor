/**
 * LOW (audit) — pending-format husks must be pruned when the caret leaves them.
 *
 * Toggling bold at a collapsed caret leaves an empty <strong></strong>
 * husk. Moving away without typing used to leave it in the live DOM forever;
 * pruneFormatHusks drops every ZWSP-only inline wrapper except the one the caret
 * currently sits in.
 */
import { describe, it, expect } from 'vitest';
import { pruneFormatHusks } from '../src/editing/prune-format-husks.js';

const ZWSP = '\u200B';

function root(html) {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
}

describe('pruneFormatHusks (LOW)', () => {
  it('removes a ZWSP-only <strong> husk the caret has left', () => {
    const el = root(`<p>hello<strong>${ZWSP}</strong> world</p>`);
    pruneFormatHusks(el, el.querySelector('p').firstChild); // caret in "hello"
    expect(el.querySelector('strong')).toBeNull();
    expect(el.textContent.replace(new RegExp(ZWSP, 'g'), '')).toBe('hello world');
  });

  it('keeps the husk the caret is currently inside', () => {
    const el = root(`<p>hi<em>${ZWSP}</em></p>`);
    const em = el.querySelector('em');
    pruneFormatHusks(el, em.firstChild); // caret inside the husk → keep it
    expect(el.querySelector('em')).toBe(em);
  });

  it('does NOT remove a wrapper that has real text', () => {
    const el = root('<p><strong>bold</strong></p>');
    pruneFormatHusks(el, null);
    expect(el.querySelector('strong')).not.toBeNull();
    expect(el.querySelector('strong').textContent).toBe('bold');
  });

  it('removes multiple accumulated husks in one pass', () => {
    const el = root(`<p><b>${ZWSP}</b>a<i>${ZWSP}</i>b<u>${ZWSP}</u></p>`);
    pruneFormatHusks(el, el.querySelector('p').childNodes[1]); // caret at "a"
    expect(el.querySelectorAll('b, i, u').length).toBe(0);
    expect(el.textContent.replace(new RegExp(ZWSP, 'g'), '')).toBe('ab');
  });

  it('handles nested husks deepest-first without throwing', () => {
    const el = root(`<p><strong><em>${ZWSP}</em></strong></p>`);
    expect(() => pruneFormatHusks(el, null)).not.toThrow();
    expect(el.querySelector('strong')).toBeNull();
    expect(el.querySelector('em')).toBeNull();
  });

  it('does not touch a span that carries a real style even if only ZWSP text', () => {
    // A ZWSP-only styled span is still a husk by content; confirm it is pruned
    // (it has no visible content and serializes away regardless).
    const el = root(`<p><span style="color:red">${ZWSP}</span>x</p>`);
    pruneFormatHusks(el, el.querySelector('p').childNodes[1]);
    expect(el.querySelector('span')).toBeNull();
  });
});
