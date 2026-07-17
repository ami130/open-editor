/**
 * zip-store.js — a minimal, zero-dependency ZIP writer (STORE method, no
 * compression). A .docx is a ZIP of XML parts; store-only is a fully valid
 * ZIP that Word/LibreOffice open without complaint, and it avoids bundling a
 * DEFLATE implementation (the zero-dep rule).
 *
 * Pure + synchronous: `zipStore([{name, data}]) → Uint8Array`. `data` is a
 * string (UTF-8 encoded here) or a Uint8Array. No streaming, no window, no
 * Node APIs — trivially unit-testable and browser-safe.
 *
 * Format refs: PKWARE APPNOTE 4.3 — local file header (0x04034b50), central
 * directory header (0x02014b50), end-of-central-directory (0x06054b50). We
 * emit version-needed 2.0, no data descriptors, DOS epoch time (deterministic
 * output — important for reproducible tests, and Date.* is unavailable here).
 */

const enc = new TextEncoder();

// ── CRC-32 (IEEE 802.3), table built once. ──
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Little-endian writers into a DataView-backed array. */
function u16(arr, off, v) { arr[off] = v & 0xff; arr[off + 1] = (v >>> 8) & 0xff; }
function u32(arr, off, v) {
  arr[off] = v & 0xff; arr[off + 1] = (v >>> 8) & 0xff;
  arr[off + 2] = (v >>> 16) & 0xff; arr[off + 3] = (v >>> 24) & 0xff;
}

/**
 * @param {Array<{name: string, data: string|Uint8Array}>} entries
 * @returns {Uint8Array} the complete ZIP archive bytes
 */
export function zipStore(entries) {
  const files = entries.map((e) => {
    const nameBytes = enc.encode(e.name);
    const data = typeof e.data === 'string' ? enc.encode(e.data) : e.data;
    return { nameBytes, data, crc: crc32(data) };
  });

  const LOCAL_HEADER = 30;   // fixed portion of a local file header
  const CENTRAL_HEADER = 46; // fixed portion of a central directory header
  const EOCD = 22;           // end-of-central-directory record

  // Total size = Σ(local header + name + data) + Σ(central header + name) + EOCD.
  let localSize = 0;
  let centralSize = 0;
  for (const f of files) {
    localSize += LOCAL_HEADER + f.nameBytes.length + f.data.length;
    centralSize += CENTRAL_HEADER + f.nameBytes.length;
  }
  const out = new Uint8Array(localSize + centralSize + EOCD);

  // ── Local file headers + data, tracking each file's offset. ──
  let off = 0;
  for (const f of files) {
    f.offset = off;
    u32(out, off, 0x04034b50);          // local file header signature
    u16(out, off + 4, 20);              // version needed to extract (2.0)
    u16(out, off + 6, 0);               // general purpose flag
    u16(out, off + 8, 0);               // compression method: 0 = STORE
    u16(out, off + 10, 0);              // mod time (DOS epoch)
    u16(out, off + 12, 0x21);           // mod date (DOS epoch: 1980-01-01)
    u32(out, off + 14, f.crc);          // CRC-32
    u32(out, off + 18, f.data.length);  // compressed size (== uncompressed)
    u32(out, off + 22, f.data.length);  // uncompressed size
    u16(out, off + 26, f.nameBytes.length); // file name length
    u16(out, off + 28, 0);              // extra field length
    off += LOCAL_HEADER;
    out.set(f.nameBytes, off); off += f.nameBytes.length;
    out.set(f.data, off); off += f.data.length;
  }

  // ── Central directory. ──
  const centralStart = off;
  for (const f of files) {
    u32(out, off, 0x02014b50);          // central dir header signature
    u16(out, off + 4, 20);              // version made by
    u16(out, off + 6, 20);              // version needed
    u16(out, off + 8, 0);               // flags
    u16(out, off + 10, 0);              // compression: STORE
    u16(out, off + 12, 0);              // mod time
    u16(out, off + 14, 0x21);           // mod date
    u32(out, off + 16, f.crc);          // CRC-32
    u32(out, off + 20, f.data.length);  // compressed size
    u32(out, off + 24, f.data.length);  // uncompressed size
    u16(out, off + 28, f.nameBytes.length); // name length
    u16(out, off + 30, 0);              // extra length
    u16(out, off + 32, 0);              // comment length
    u16(out, off + 34, 0);              // disk number start
    u16(out, off + 36, 0);              // internal attrs
    u32(out, off + 38, 0);              // external attrs
    u32(out, off + 42, f.offset);       // local header offset
    off += CENTRAL_HEADER;
    out.set(f.nameBytes, off); off += f.nameBytes.length;
  }

  // ── End of central directory. ──
  u32(out, off, 0x06054b50);            // EOCD signature
  u16(out, off + 4, 0);                 // disk number
  u16(out, off + 6, 0);                 // disk with central dir
  u16(out, off + 8, files.length);      // entries on this disk
  u16(out, off + 10, files.length);     // total entries
  u32(out, off + 12, centralSize);      // central directory size
  u32(out, off + 16, centralStart);     // central directory offset
  u16(out, off + 20, 0);                // comment length

  return out;
}

export { crc32 };
