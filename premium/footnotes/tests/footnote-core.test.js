import { describe, it, expect } from 'vitest';
import {
  createRefMarker, refMarkers, notesSection, renumber, REF_SELECTOR,
} from '../src/footnote-core.js';

const root = (html) => { const d = document.createElement('div'); d.innerHTML = html; return d; };

describe('createRefMarker', () => {
  it('creates a contenteditable=false sup with the footnote-ref class', () => {
    const sup = createRefMarker(document);
    expect(sup.tagName).toBe('SUP');
    expect(sup.className).toBe('oe-footnote-ref');
    expect(sup.getAttribute('contenteditable')).toBe('false');
    expect(sup.hasAttribute('data-oe-footnote-ref')).toBe(true);
  });
});

describe('renumber', () => {
  it('numbers a single marker 1 and creates the notes section', () => {
    const r = root('<p>Hi<sup class="oe-footnote-ref" data-oe-footnote-ref="0">0</sup></p>');
    const n = renumber(r, document);
    expect(n).toBe(1);
    const m = refMarkers(r)[0];
    expect(m.getAttribute('data-oe-footnote-ref')).toBe('1');
    expect(m.id).toBe('fnref-1');
    expect(m.textContent).toBe('1');
    const ol = notesSection(r);
    expect(ol).not.toBeNull();
    expect(ol.querySelectorAll('li').length).toBe(1);
    expect(ol.querySelector('li').id).toBe('fn-1');
  });

  it('numbers multiple markers in DOCUMENT order regardless of insertion order', () => {
    const r = root('<p>A<sup class="oe-footnote-ref" data-oe-footnote-ref="0">0</sup> '
      + 'B<sup class="oe-footnote-ref" data-oe-footnote-ref="0">0</sup> '
      + 'C<sup class="oe-footnote-ref" data-oe-footnote-ref="0">0</sup></p>');
    expect(renumber(r, document)).toBe(3);
    const nums = refMarkers(r).map((m) => m.getAttribute('data-oe-footnote-ref'));
    expect(nums).toEqual(['1', '2', '3']);
    expect(notesSection(r).querySelectorAll('li').length).toBe(3);
  });

  it('PRESERVES note text across renumbering when a marker is inserted in the middle', () => {
    // Start with two footnotes and their notes.
    const r = root(
      '<p>A<sup class="oe-footnote-ref" data-oe-footnote-ref="1" id="fnref-1">1</sup> '
      + 'C<sup class="oe-footnote-ref" data-oe-footnote-ref="2" id="fnref-2">2</sup></p>'
      + '<ol class="oe-footnotes" data-oe-footnotes>'
      + '<li id="fn-1" data-oe-footnote="1">note A</li>'
      + '<li id="fn-2" data-oe-footnote="2">note C</li></ol>');
    // Insert a new marker BETWEEN them (its ref="0" placeholder).
    const mid = document.createElement('sup');
    mid.className = 'oe-footnote-ref';
    mid.setAttribute('data-oe-footnote-ref', '0');
    const p = r.querySelector('p');
    // put it after the first marker
    p.querySelector('#fnref-1').after(mid);

    expect(renumber(r, document)).toBe(3);
    const notes = [...notesSection(r).querySelectorAll('li')].map((li) => li.textContent);
    // A stays 1, the new one becomes 2 (empty), C shifts to 3 keeping "note C"
    expect(notes[0]).toBe('note A');
    expect(notes[1]).toBe('');       // the freshly inserted footnote, empty body
    expect(notes[2]).toBe('note C'); // text followed its marker
  });

  it('C1 — duplicate old numbers do NOT corrupt/duplicate note bodies (data-loss guard)', () => {
    // Two markers carry the SAME old number (e.g. a pasted/duplicated marker),
    // and there are two notes with that number. Each note body must map to a
    // DISTINCT footnote — no duplication of one, no loss of the other.
    const r = root(
      '<p>x<sup class="oe-footnote-ref" data-oe-footnote-ref="2">2</sup>'
      + 'y<sup class="oe-footnote-ref" data-oe-footnote-ref="2">2</sup></p>'
      + '<ol class="oe-footnotes" data-oe-footnotes>'
      + '<li id="fn-2" data-oe-footnote="2">first note</li>'
      + '<li id="fn-2" data-oe-footnote="2">second note</li></ol>');
    expect(renumber(r, document)).toBe(2);
    const notes = [...notesSection(r).querySelectorAll('li')].map((li) => li.textContent);
    expect(notes).toEqual(['first note', 'second note']); // distinct, in order — no dup, no loss
  });

  it('C1 — two freshly-inserted markers (both placeholder "0") get separate empty notes', () => {
    const r = root('<p>a<sup class="oe-footnote-ref" data-oe-footnote-ref="0">0</sup>'
      + 'b<sup class="oe-footnote-ref" data-oe-footnote-ref="0">0</sup></p>');
    expect(renumber(r, document)).toBe(2);
    expect(notesSection(r).querySelectorAll('li').length).toBe(2);
  });

  it('removes the notes section entirely when the last marker is gone', () => {
    const r = root('<p>text</p><ol class="oe-footnotes" data-oe-footnotes><li id="fn-1" data-oe-footnote="1">x</li></ol>');
    expect(renumber(r, document)).toBe(0);
    expect(notesSection(r)).toBeNull();
  });

  it('keeps the notes section pinned to the END of the document', () => {
    const r = root('<ol class="oe-footnotes" data-oe-footnotes><li id="fn-1" data-oe-footnote="1">x</li></ol>'
      + '<p>Body<sup class="oe-footnote-ref" data-oe-footnote-ref="1">1</sup></p>');
    renumber(r, document);
    expect(r.lastElementChild.matches('ol.oe-footnotes')).toBe(true);
  });

  it('is idempotent — running twice yields the same result', () => {
    const r = root('<p>A<sup class="oe-footnote-ref" data-oe-footnote-ref="0">0</sup></p>');
    renumber(r, document);
    const first = r.innerHTML;
    renumber(r, document);
    expect(r.innerHTML).toBe(first);
  });

  it('empty document → 0 footnotes, no section, no throw', () => {
    const r = root('<p>nothing here</p>');
    expect(renumber(r, document)).toBe(0);
    expect(r.querySelector(REF_SELECTOR)).toBeNull();
  });
});
