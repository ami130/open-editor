/**
 * paste-fixtures.js — Phase 12 test corpus.
 *
 * Realistic captured clipboard HTML from the three sources the paste engine
 * must handle. Kept faithful to what the real apps emit (headers, mso-* styles,
 * conditional comments, fake list bullets, the Docs guid wrapper, style-only
 * spans) so cleanup stages are tested against production-shaped garbage — not
 * a sanitized idealization. Each fixture is the string a `text/html` clipboard
 * flavor would carry.
 */

// ── Microsoft Word ──────────────────────────────────────────────────────────
// A Word paste: XML/Office header, conditional comments, MsoNormal paragraphs,
// mso-* inline styles, <o:p> remnants, and a fake bulleted list (mso-list).
export const WORD_PARAGRAPH = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta name=ProgId content=Word.Document>
<meta name=Generator content="Microsoft Word 15">
<!--[if gte mso 9]><xml><o:OfficeDocumentSettings/></xml><![endif]-->
<style>p.MsoNormal { margin:0; font-family:"Calibri"; }</style></head>
<body lang=EN-US>
<p class=MsoNormal style='margin-bottom:0in;mso-list:none'>
<span style='font-size:11.0pt;font-family:"Calibri",sans-serif'>Hello <b>bold</b> world<o:p></o:p></span></p>
</body></html>`;

export const WORD_LIST = `<html xmlns:o="urn:schemas-microsoft-com:office:office">
<head><meta name=Generator content="Microsoft Word 15"></head><body>
<p class=MsoListParagraph style='mso-list:l0 level1 lfo1'>
<!--[if !supportLists]--><span style='font-family:Symbol;mso-list:Ignore'>·<span
style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;</span></span><!--[endif]-->First item<o:p></o:p></p>
<p class=MsoListParagraph style='mso-list:l0 level1 lfo1'>
<!--[if !supportLists]--><span style='font-family:Symbol;mso-list:Ignore'>·<span
style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;</span></span><!--[endif]-->Second item<o:p></o:p></p>
<p class=MsoListParagraph style='mso-list:l0 level2 lfo1'>
<!--[if !supportLists]--><span style='font-family:"Courier New";mso-list:Ignore'>o<span
style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;</span></span><!--[endif]-->Nested item<o:p></o:p></p>
</body></html>`;

// ── Google Docs ─────────────────────────────────────────────────────────────
// The signature docs-internal-guid <b> wrapper; formatting expressed as inline
// styles (font-weight:700, font-style:italic, text-decoration) on <span>s.
export const GDOCS_PARAGRAPH = `<meta charset="utf-8">
<b style="font-weight:normal;" id="docs-internal-guid-abc-1234-5678">
<p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;">
<span style="font-size:11pt;font-family:Arial;color:#000000;font-weight:400;">Plain then </span>
<span style="font-size:11pt;font-family:Arial;font-weight:700;">bold</span>
<span style="font-size:11pt;font-family:Arial;font-style:italic;"> and italic</span>
<span style="font-size:11pt;font-family:Arial;text-decoration:underline;"> underlined</span></p>
</b>`;

// ── Generic browser paste ───────────────────────────────────────────────────
// Clean-ish HTML from a normal web page: no source markers.
export const GENERIC_PARAGRAPH =
  '<p>Just a <strong>normal</strong> paragraph with a <a href="https://example.com">link</a>.</p>';

// A generic paste that still carries a dangerous handler — proves the security
// sanitizer (pipeline stage 0) runs regardless of source.
export const GENERIC_UNSAFE =
  '<p>ok<img src=x onerror="alert(1)"></p><script>alert(2)</script>';

// Plain text (no HTML flavor at all).
export const PLAIN_MULTILINE = 'line one\nline two\n\nsecond paragraph';
