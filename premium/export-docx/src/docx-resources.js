/**
 * docx-resources.js — collects the relationships and media parts a document
 * body needs (hyperlinks + embedded images) as the DOM walk emits them, then
 * hands buildDocx() everything to assemble document.xml.rels,
 * [Content_Types].xml, and the word/media/ parts.
 *
 * Pure + synchronous. Images are embedded ONLY from data: URIs (bytes available
 * in-process); remote http(s) images can't be fetched synchronously and are
 * left to a placeholder by the caller. Relationship ids are allocated from a
 * shared counter so hyperlinks and images never collide.
 */

// rId1/rId2 are reserved by docx-parts for styles.xml / numbering.xml.
const RESERVED_RIDS = 2;

/** Decode a `data:[mime][;base64],DATA` URI → { mime, ext, bytes } or null. */
export function decodeDataUri(uri) {
  if (typeof uri !== 'string') return null;
  const m = uri.match(/^data:([^;,]+)?(;base64)?,(.*)$/is);
  if (!m) return null;
  const mime = (m[1] || 'application/octet-stream').toLowerCase();
  const isB64 = !!m[2];
  const raw = m[3] || '';
  const EXT = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg',
    'image/gif': 'gif', 'image/bmp': 'bmp', 'image/webp': 'webp',
  };
  const ext = EXT[mime];
  if (!ext) return null; // only embed known raster image types
  let bytes;
  try {
    if (isB64) {
      const bin = atob(raw.replace(/\s/g, ''));
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else {
      // Non-base64 data URI: each %XX is ONE raw byte and every other char is
      // its own byte. TextEncoder(decodeURIComponent(...)) was wrong — it
      // re-encodes as UTF-8, so any byte ≥0x80 (common in real image data)
      // became two bytes → a corrupt image. Decode percent-escapes to bytes
      // directly instead.
      const out = [];
      for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        if (ch === '%' && i + 2 < raw.length) {
          const hex = raw.slice(i + 1, i + 3);
          if (/^[0-9a-fA-F]{2}$/.test(hex)) { out.push(parseInt(hex, 16)); i += 2; continue; }
        }
        out.push(ch.charCodeAt(0) & 0xff);
      }
      bytes = new Uint8Array(out);
    }
  } catch {
    return null;
  }
  return { mime, ext, bytes };
}

// numId 1 = the shared bullet list; numId 2 = the shared/legacy decimal list.
// Per-list ordered instances are allocated from 3 up so each <ol> restarts its
// own count (two separate ordered lists must NOT continue each other).
const FIRST_DYNAMIC_NUMID = 3;

export function createResourceCollector() {
  let next = RESERVED_RIDS + 1;
  const hyperlinks = [];       // { rId, target }
  const images = [];           // { rId, ext, mime, bytes, partName }
  const extsSeen = new Set();  // for [Content_Types] Default entries
  let nextNumId = FIRST_DYNAMIC_NUMID;
  const orderedLists = [];     // { numId, start, fmt } — one per <ol>

  return {
    /**
     * Register one ordered list; returns a fresh numId so it restarts its own
     * numbering. `start` (from <ol start>) sets the first number; `type` (a|A|
     * i|I|1) selects the numFmt. buildDocx turns these into <w:num> instances
     * (with <w:lvlOverride><w:startOverride> when start != 1).
     */
    addOrderedList({ start, type, ilvl } = {}) {
      const FMT = { a: 'lowerLetter', A: 'upperLetter', i: 'lowerRoman', I: 'upperRoman', 1: 'decimal' };
      const numId = nextNumId++;
      const s = parseInt(start, 10);
      const lvl = Number.isFinite(ilvl) && ilvl >= 0 && ilvl <= 3 ? ilvl : 0;
      orderedLists.push({
        numId,
        start: Number.isFinite(s) && s > 0 ? s : 1,
        fmt: FMT[type] || 'decimal',
        ilvl: lvl, // the level this list's items render at (nested lists > 0)
      });
      return numId;
    },
    /** Register an external hyperlink target; returns its rId. */
    addHyperlink(target) {
      const rId = `rId${next++}`;
      hyperlinks.push({ rId, target: String(target || '') });
      return rId;
    },
    /**
     * Register an image from a data: URI. Returns { rId, partName } or null if
     * the URI isn't an embeddable data image (caller then uses a placeholder).
     */
    addImage(dataUri) {
      const decoded = decodeDataUri(dataUri);
      if (!decoded) return null;
      return this.addResolvedImage(decoded);
    },
    /**
     * Register an already-resolved image ({ mime, ext, bytes } — e.g. from a
     * remote fetch done ahead of time by image-fetch.js). Returns
     * { rId, partName }. Shares the same media-part/rId numbering as
     * addImage() so embedded data: and fetched-remote images never collide.
     */
    addResolvedImage(decoded) {
      const rId = `rId${next++}`;
      const idx = images.length + 1;
      const partName = `media/image${idx}.${decoded.ext}`;
      images.push({ rId, ext: decoded.ext, mime: decoded.mime, bytes: decoded.bytes, partName });
      extsSeen.add(decoded.ext);
      return { rId, partName };
    },
    /** Snapshot for buildDocx assembly. */
    result() {
      return { hyperlinks, images, exts: [...extsSeen], orderedLists };
    },
  };
}
