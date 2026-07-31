/**
 * docx-parts.js — the fixed OOXML boilerplate parts a minimal .docx needs,
 * plus buildDocx() which assembles them (with the generated body) into ZIP
 * bytes via zip-store.
 *
 * A valid WordprocessingML package is:
 *   [Content_Types].xml          content-type registrations
 *   _rels/.rels                  package → main document relationship
 *   word/document.xml            the content (body from ooxml-body.js)
 *   word/_rels/document.xml.rels document → styles/numbering relationships
 *   word/styles.xml              paragraph/character styles we reference
 *   word/numbering.xml           list definitions (numId 1 bullet, 2 decimal)
 *
 * Every style id referenced in ooxml-body.js (Heading1-6, Quote, Code,
 * CodeBlock, Caption, TableHeader) is defined in styles.xml — an undefined
 * style id makes Word fall back silently, so they must stay in lockstep.
 */
import { zipStore } from './zip-store.js';
import { escapeXml } from './ooxml-body.js';

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`;

const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

// Heading paragraph styles. These MUST carry the markers Word uses to treat a
// style as a REAL built-in heading, or Word silently falls the paragraph back
// to Normal (the "H1 exports as plain text" bug): the canonical name
// "heading N", w:basedOn Normal, w:next Normal, a w:link to a matching heading
// CHARACTER style, w:uiPriority, and w:qFormat (so it shows in the gallery).
// We ALSO set explicit color/size/bold on the run props so the heading looks
// right even in readers that don't fully resolve the built-in mapping —
// belt-and-suspenders, since the whole point is it must never look like body
// text. Word's own default heading color is 2E74B5 (accent blue); H1/H2 use it.
function headingStyle(n) {
  const sizes = { 1: 32, 2: 28, 3: 26, 4: 24, 5: 22, 6: 20 }; // half-points
  const color = n <= 2 ? '2E74B5' : (n <= 4 ? '2E74B5' : '1F4E79');
  return `<w:style w:type="paragraph" w:styleId="Heading${n}">`
    + `<w:name w:val="heading ${n}"/>`
    + '<w:basedOn w:val="Normal"/>'
    + '<w:next w:val="Normal"/>'
    + `<w:link w:val="Heading${n}Char"/>`
    + `<w:uiPriority w:val="${n === 1 ? 9 : n}"/>`
    + '<w:qFormat/>'
    + '<w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="240" w:after="60"/><w:outlineLvl w:val="' + (n - 1) + '"/></w:pPr>'
    + `<w:rPr><w:b/><w:color w:val="${color}"/><w:sz w:val="${sizes[n]}"/></w:rPr>`
    + '</w:style>'
    // The linked character style Word expects for a heading (w:link above).
    + `<w:style w:type="character" w:customStyle="1" w:styleId="Heading${n}Char">`
    + `<w:name w:val="Heading ${n} Char"/>`
    + `<w:link w:val="Heading${n}"/>`
    + '<w:uiPriority w:val="9"/>'
    + `<w:rPr><w:b/><w:color w:val="${color}"/><w:sz w:val="${sizes[n]}"/></w:rPr>`
    + '</w:style>';
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W_NS}>
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
${[1, 2, 3, 4, 5, 6].map(headingStyle).join('')}
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="29"/><w:qFormat/><w:pPr><w:ind w:left="480"/></w:pPr><w:rPr><w:i/><w:color w:val="555555"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="CodeBlock"><w:name w:val="Code Block"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:shd w:val="clear" w:fill="F5F6F8"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="20"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="35"/><w:qFormat/><w:rPr><w:i/><w:color w:val="666666"/><w:sz w:val="18"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="TableHeader"><w:name w:val="Table Header"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:rPr><w:b/></w:rPr></w:style>
<w:style w:type="character" w:customStyle="1" w:styleId="Code"><w:name w:val="Code Char"/><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/></w:rPr></w:style>
<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:uiPriority w:val="99"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>
</w:styles>`;

const BULLET_ABSTRACT = `<w:abstractNum w:abstractNumId="0">${
  [0, 1, 2, 3].map((lvl) => `<w:lvl w:ilvl="${lvl}"><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:pPr><w:ind w:left="${(lvl + 1) * 480}" w:hanging="360"/></w:pPr></w:lvl>`).join('')
}</w:abstractNum>`;
const DECIMAL_ABSTRACT = `<w:abstractNum w:abstractNumId="1">${
  [0, 1, 2, 3].map((lvl) => `<w:lvl w:ilvl="${lvl}"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%${lvl + 1}."/><w:pPr><w:ind w:left="${(lvl + 1) * 480}" w:hanging="360"/></w:pPr></w:lvl>`).join('')
}</w:abstractNum>`;

/**
 * numbering.xml. numId 1 = shared bullet, numId 2 = legacy shared decimal.
 * Each entry in `orderedLists` (from the collector) gets its OWN <w:num>
 * referencing the decimal abstract, with lvlOverride to (a) restart at its
 * `start` and (b) apply its `fmt` (a/A/i/I). Distinct numIds are what make
 * separate ordered lists restart instead of continuing each other.
 */
function numbering(orderedLists) {
  const dynamic = (orderedLists || []).map((ol) => {
    // Override at the level this list's items actually render at (nested lists
    // are > 0), so a nested <ol type="a"> keeps its letter format and restart —
    // previously the override was hard-pinned to ilvl 0 and nested lists lost
    // their type/start. (I11)
    const lvl = Number.isFinite(ol.ilvl) ? ol.ilvl : 0;
    const ind = (lvl + 1) * 480;
    const overrides = [];
    if (ol.fmt && ol.fmt !== 'decimal') {
      overrides.push(`<w:lvlOverride w:ilvl="${lvl}"><w:lvl w:ilvl="${lvl}"><w:start w:val="${ol.start}"/><w:numFmt w:val="${ol.fmt}"/><w:lvlText w:val="%${lvl + 1}."/><w:pPr><w:ind w:left="${ind}" w:hanging="360"/></w:pPr></w:lvl></w:lvlOverride>`);
    } else if (ol.start !== 1) {
      overrides.push(`<w:lvlOverride w:ilvl="${lvl}"><w:startOverride w:val="${ol.start}"/></w:lvlOverride>`);
    }
    return `<w:num w:numId="${ol.numId}"><w:abstractNumId w:val="1"/>${overrides.join('')}</w:num>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering ${W_NS}>${BULLET_ABSTRACT}${DECIMAL_ABSTRACT}<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>${dynamic}</w:numbering>`;
}

/** page size + margins for the section (twips: 1 inch = 1440). */
function sectPr() {
  return '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>';
}

// Namespaces needed on <w:document>: r (relationships, for hyperlinks + image
// blips), and the DrawingML trio (wp/a/pic) for embedded images.
const DOC_NS = `${W_NS} `
  + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
  + 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
  + 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
  + 'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

function documentXml(bodyInner) {
  // No auto-injected title heading: the document's title is already the
  // downloaded FILENAME (Report.docx), and duplicating it as a bold heading
  // above the user's own content was unwanted — especially since the user's
  // content usually already starts with its own <h1>. If a title was never
  // set, this used to literally inject the word "Document" as a heading.
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${DOC_NS}><w:body>${bodyInner}${sectPr()}</w:body></w:document>`;
}

/** document.xml.rels: styles + numbering, plus any hyperlink/image rels. */
function docRels(resources) {
  const rels = [
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>',
  ];
  for (const h of resources.hyperlinks) {
    rels.push(`<Relationship Id="${h.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escapeXml(h.target)}" TargetMode="External"/>`);
  }
  for (const img of resources.images) {
    rels.push(`<Relationship Id="${img.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${img.partName}"/>`);
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`;
}

/** [Content_Types].xml with a Default entry per embedded image extension. */
function contentTypes(resources) {
  const MIME = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp' };
  const imgDefaults = resources.exts
    .map((ext) => `<Default Extension="${ext}" ContentType="${MIME[ext] || 'application/octet-stream'}"/>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>${imgDefaults}
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`;
}

/**
 * Assemble a complete .docx.
 * @param {string} bodyInner  <w:body> inner XML from bodyXml()
 * @param {object} [opts]     { title, resources } — resources from a
 *   createResourceCollector().result(); omit for a plain (no links/images) doc.
 * @returns {Uint8Array} the .docx (ZIP) bytes
 */
export function buildDocx(bodyInner, opts = {}) {
  const resources = opts.resources || { hyperlinks: [], images: [], exts: [], orderedLists: [] };
  const parts = [
    { name: '[Content_Types].xml', data: resources.images.length ? contentTypes(resources) : CONTENT_TYPES },
    { name: '_rels/.rels', data: ROOT_RELS },
    { name: 'word/document.xml', data: documentXml(bodyInner) },
    { name: 'word/_rels/document.xml.rels', data: (resources.hyperlinks.length || resources.images.length) ? docRels(resources) : DOC_RELS },
    { name: 'word/styles.xml', data: STYLES },
    { name: 'word/numbering.xml', data: numbering(resources.orderedLists) },
  ];
  // Embedded image media parts (bytes are Uint8Array; zip-store handles them).
  for (const img of resources.images) {
    parts.push({ name: `word/${img.partName}`, data: img.bytes });
  }
  return zipStore(parts);
}

export { documentXml };
