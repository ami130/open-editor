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
      bytes = new TextEncoder().encode(decodeURIComponent(raw));
    }
  } catch {
    return null;
  }
  return { mime, ext, bytes };
}

export function createResourceCollector() {
  let next = RESERVED_RIDS + 1;
  const hyperlinks = [];       // { rId, target }
  const images = [];           // { rId, ext, mime, bytes, partName }
  const extsSeen = new Set();  // for [Content_Types] Default entries

  return {
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
      const rId = `rId${next++}`;
      const idx = images.length + 1;
      const partName = `media/image${idx}.${decoded.ext}`;
      images.push({ rId, ext: decoded.ext, mime: decoded.mime, bytes: decoded.bytes, partName });
      extsSeen.add(decoded.ext);
      return { rId, partName };
    },
    /** Snapshot for buildDocx assembly. */
    result() {
      return { hyperlinks, images, exts: [...extsSeen] };
    },
  };
}
