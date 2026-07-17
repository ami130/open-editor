/**
 * fidelity.test.js — full visual fidelity: table colors/styles/widths/caption
 * and inline text color/highlight/size survive into the OOXML body.
 */
import { describe, it, expect } from 'vitest';
import { bodyXml } from '../src/ooxml-body.js';

const md = (html) => bodyXml(html, document);

describe('inline run fidelity', () => {
  it('span color → w:color', () => {
    expect(md('<p><span style="color: #1e88e5">x</span></p>')).toContain('<w:color w:val="1E88E5"/>');
  });
  it('span background / mark → w:shd highlight', () => {
    expect(md('<p><span style="background-color: rgb(255,235,59)">x</span></p>'))
      .toContain('<w:shd w:val="clear" w:fill="FFEB3B"/>');
    expect(md('<p><mark>x</mark></p>')).toContain('w:shd');
  });
  it('font-size px → half-points w:sz', () => {
    // 24px → 18pt → 36 half-points
    expect(md('<p><span style="font-size: 24px">x</span></p>')).toContain('<w:sz w:val="36"/>');
  });
  it('sup / sub → vertAlign', () => {
    expect(md('<p><sup>x</sup></p>')).toContain('<w:vertAlign w:val="superscript"/>');
    expect(md('<p><sub>x</sub></p>')).toContain('<w:vertAlign w:val="subscript"/>');
  });
  it('nested span styles combine with marks', () => {
    const xml = md('<p><strong><span style="color:#ff0000">x</span></strong></p>');
    expect(xml).toContain('<w:b/>');
    expect(xml).toContain('<w:color w:val="FF0000"/>');
  });
});

describe('table color / style fidelity', () => {
  const colored = '<table class="oe-table"><colgroup><col style="width: 60.0000%;"><col style="width: 40.0000%;"></colgroup>'
    + '<caption>Sales</caption><tbody>'
    + '<tr><th style="background-color: rgb(30,136,229); color:#ffffff;">Region</th><th>Sales</th></tr>'
    + '<tr><td style="background-color: rgb(255,249,196);">North</td><td>120</td></tr>'
    + '</tbody></table>';

  it('cell background → w:shd fill on the cell', () => {
    const xml = md(colored);
    expect(xml).toContain('<w:shd w:val="clear" w:color="auto" w:fill="1E88E5"/>'); // header cell
    expect(xml).toContain('w:fill="FFF9C4"'); // body cell
  });
  it('header text color → w:color run', () => {
    expect(md(colored)).toContain('<w:color w:val="FFFFFF"/>');
  });
  it('col widths → w:gridCol in twips (60/40 of content width)', () => {
    const xml = md(colored);
    // 60% of 9026 ≈ 5416, 40% ≈ 3610
    expect(xml).toMatch(/<w:gridCol w:w="541[0-9]"\/>/);
    expect(xml).toMatch(/<w:gridCol w:w="361[0-9]"\/>/);
  });
  it('caption → a Caption-styled paragraph BEFORE the table', () => {
    const xml = md(colored);
    const capIdx = xml.indexOf('Sales');
    const tblIdx = xml.indexOf('<w:tbl>');
    expect(xml).toContain('<w:pStyle w:val="Caption"/>');
    expect(capIdx).toBeLessThan(tblIdx); // caption precedes the table
  });

  it('bordered preset → thicker table borders; dotted → dotted val', () => {
    expect(md('<table class="oe-table oe-table--bordered"><tbody><tr><td>a</td></tr></tbody></table>'))
      .toContain('w:sz="8"');
    expect(md('<table class="oe-table oe-table--dotted"><tbody><tr><td>a</td></tr></tbody></table>'))
      .toContain('w:val="dotted"');
  });

  it('striped even rows get the --oe-table-stripe fill (or default)', () => {
    const striped = '<table class="oe-table oe-table--striped" style="--oe-table-stripe: #eef3fb;"><tbody>'
      + '<tr><td>r0</td></tr><tr><td>r1</td></tr></tbody></table>';
    const xml = md(striped);
    expect(xml).toContain('w:fill="EEF3FB"'); // second row (index 1, even in 0-based → striped)
  });

  it('borderless preset → no table borders block', () => {
    const xml = md('<table class="oe-table oe-table--borderless"><tbody><tr><td>a</td></tr></tbody></table>');
    expect(xml).not.toContain('<w:tblBorders>');
  });

  it('per-cell inline border → w:tcBorders', () => {
    const xml = md('<table class="oe-table"><tbody><tr><td style="border: 2px solid #ff0000">a</td></tr></tbody></table>');
    expect(xml).toContain('<w:tcBorders>');
    expect(xml).toContain('w:color="FF0000"');
  });

  it('C3 — colspan → w:gridSpan and the tblGrid counts summed spans', () => {
    const xml = md('<table class="oe-table"><tbody>'
      + '<tr><td colspan="3">wide</td></tr>'
      + '<tr><td>a</td><td>b</td><td>c</td></tr></tbody></table>');
    expect(xml).toContain('<w:gridSpan w:val="3"/>');
    // 3 columns total → 3 gridCol entries
    expect((xml.match(/<w:gridCol /g) || []).length).toBe(3);
  });

  it('C3 — rowspan → vMerge restart + a continue cell in the next row', () => {
    const xml = md('<table class="oe-table"><tbody>'
      + '<tr><td rowspan="2">tall</td><td>b1</td></tr>'
      + '<tr><td>b2</td></tr></tbody></table>');
    expect(xml).toContain('<w:vMerge w:val="restart"/>');
    expect(xml).toContain('<w:vMerge w:val="continue"/>');
  });

  it('C3 — a plain table (no spans) emits no gridSpan/vMerge', () => {
    const xml = md('<table class="oe-table"><tbody><tr><td>a</td><td>b</td></tr></tbody></table>');
    expect(xml).not.toContain('w:gridSpan');
    expect(xml).not.toContain('w:vMerge');
  });
});
