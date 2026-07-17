/**
 * print-document.js — the pure builder. No window, no print; just assert the
 * produced document string is correct, complete, safe, and configurable.
 */
import { describe, it, expect } from 'vitest';
import { buildPrintDocument, normalizeOptions, escapeHtml } from '../src/print-document.js';

describe('escapeHtml', () => {
  it('escapes the five markup chars and coerces nullish to empty', () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`))
      .toBe('&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

describe('normalizeOptions', () => {
  it('applies sensible defaults', () => {
    const o = normalizeOptions();
    expect(o).toMatchObject({ title: 'Document', pageSize: 'A4', orientation: 'portrait', margin: '20mm', pageNumbers: true });
  });

  it('accepts valid page sizes/orientations, rejects junk to defaults', () => {
    expect(normalizeOptions({ pageSize: 'Letter', orientation: 'landscape' }))
      .toMatchObject({ pageSize: 'Letter', orientation: 'landscape' });
    expect(normalizeOptions({ pageSize: 'Tabloid', orientation: 'sideways' }))
      .toMatchObject({ pageSize: 'A4', orientation: 'portrait' });
  });

  it('rejects a margin containing CSS-breaking chars (defends the @page block)', () => {
    expect(normalizeOptions({ margin: '10mm' }).margin).toBe('10mm');
    expect(normalizeOptions({ margin: '10mm} body{display:none' }).margin).toBe('20mm');
    expect(normalizeOptions({ margin: '  ' }).margin).toBe('20mm');
  });

  it('pageNumbers defaults on, explicit false turns it off', () => {
    expect(normalizeOptions({}).pageNumbers).toBe(true);
    expect(normalizeOptions({ pageNumbers: false }).pageNumbers).toBe(false);
  });
});

describe('buildPrintDocument', () => {
  it('produces a complete, self-contained HTML document', () => {
    const d = buildPrintDocument('<p>Hello</p>', { title: 'My Doc' });
    expect(d).toMatch(/^<!DOCTYPE html>/);
    expect(d).toContain('<title>My Doc</title>');
    expect(d).toContain('<style>');
    expect(d).toContain('@page');
    expect(d).toContain('<main class="oe-pdf__content"><p>Hello</p></main>');
  });

  it('embeds the chosen page setup in @page', () => {
    const d = buildPrintDocument('<p>x</p>', { pageSize: 'Letter', orientation: 'landscape', margin: '15mm' });
    expect(d).toMatch(/@page\s*\{[^}]*size:\s*Letter landscape/);
    expect(d).toMatch(/margin:\s*15mm/);
  });

  it('content HTML is trusted (already sanitized) and passes through verbatim', () => {
    // getHTML() already sanitized this; the builder must NOT double-escape it
    // or the PDF would show literal tags.
    const d = buildPrintDocument('<h1>Title</h1><table><tr><th>A</th></tr></table>');
    expect(d).toContain('<h1>Title</h1>');
    expect(d).toContain('<th>A</th>');
  });

  it('ESCAPES option strings that land in markup (title/header/footer) — injection guard', () => {
    const d = buildPrintDocument('<p>ok</p>', {
      title: '</title><script>evil()</script>',
      header: '<img src=x onerror=hack>',
      footer: 'foo</div><b>bar',
    });
    expect(d).not.toContain('<script>evil()');
    expect(d).toContain('&lt;script&gt;evil()');
    expect(d).not.toContain('<img src=x onerror');
    expect(d).toContain('&lt;img src=x onerror=hack&gt;');
  });

  it('escapes a font-family so it cannot break out of the CSS rule', () => {
    const d = buildPrintDocument('<p>x</p>', { fontFamily: 'Foo} body{display:none' });
    expect(d).not.toContain('Foo} body{display:none');
  });

  it('empty content yields a valid document with an empty paragraph', () => {
    const d = buildPrintDocument('', {});
    expect(d).toContain('<main class="oe-pdf__content"><p></p></main>');
  });

  it('renders header and footer bars only when provided', () => {
    const withBars = buildPrintDocument('<p>x</p>', { header: 'Acme', footer: 'Confidential' });
    expect(withBars).toContain('oe-pdf__header');
    expect(withBars).toContain('Acme');
    expect(withBars).toContain('Confidential');
    const without = buildPrintDocument('<p>x</p>', {});
    expect(without).not.toContain('oe-pdf__header');
    expect(without).not.toContain('oe-pdf__footer');
  });

  it('carries the page-break rule so oe-page-break HRs actually break', () => {
    const d = buildPrintDocument('<p>a</p><hr class="oe-page-break"><p>b</p>');
    expect(d).toMatch(/hr\.oe-page-break\s*\{[^}]*break-after:\s*page/);
  });

  // ── Table visual fidelity (fixes the reported "table color not showing"). ──
  describe('table fidelity', () => {
    it('replicates the editor style-preset classes in the print CSS', () => {
      const d = buildPrintDocument('<p>x</p>');
      expect(d).toContain('table.oe-table--bordered');
      expect(d).toContain('table.oe-table--striped');
      expect(d).toContain('table.oe-table--dotted');
      expect(d).toContain('table.oe-table--borderless');
    });

    it('striped rule reads the --oe-table-stripe custom property (with editor fallback)', () => {
      const d = buildPrintDocument('<p>x</p>');
      expect(d).toMatch(/var\(--oe-table-stripe,\s*#f1f5f9\)/);
    });

    it('a striped table with a custom stripe var passes the inline var through', () => {
      const table = '<table class="oe-table oe-table--striped" style="--oe-table-stripe: #eef3fb;">'
        + '<tbody><tr><th>H</th></tr><tr><td>a</td></tr></tbody></table>';
      const d = buildPrintDocument(table);
      // the inline custom property survives verbatim (it's sanitized-safe)
      expect(d).toContain('--oe-table-stripe: #eef3fb;');
      expect(d).toContain('oe-table--striped');
    });

    it('inline cell colors pass through verbatim (they win by specificity in print)', () => {
      const table = '<table class="oe-table"><tbody>'
        + '<tr><th style="background-color: rgb(30,136,229); color: #fff;">Region</th></tr>'
        + '<tr><td style="background-color: rgb(255,249,196);">North</td></tr>'
        + '</tbody></table>';
      const d = buildPrintDocument(table);
      expect(d).toContain('background-color: rgb(30,136,229)');
      expect(d).toContain('background-color: rgb(255,249,196)');
    });

    it('styles caption and keeps col width percentages', () => {
      const d = buildPrintDocument('<p>x</p>');
      expect(d).toMatch(/caption\s*\{[^}]*caption-side:\s*top/);
      const table = '<table class="oe-table"><colgroup><col style="width: 50.0000%;"></colgroup>'
        + '<caption>Cap</caption><tbody><tr><td>a</td></tr></tbody></table>';
      const out = buildPrintDocument(table);
      expect(out).toContain('width: 50.0000%');
      expect(out).toContain('<caption>Cap</caption>');
    });
  });
});
