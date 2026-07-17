/**
 * zip-store.js — the zero-dep STORE-method ZIP writer. Validates byte-level
 * correctness: known-answer CRC, signatures, offsets, and structural fields.
 * (A real-unzip round-trip is exercised in docx-roundtrip.test.js.)
 */
import { describe, it, expect } from 'vitest';
import { zipStore, crc32 } from '../src/zip-store.js';

const enc = new TextEncoder();
const u32le = (a, o) => a[o] | (a[o + 1] << 8) | (a[o + 2] << 16) | (a[o + 3] << 24);
const u16le = (a, o) => a[o] | (a[o + 1] << 8);

describe('crc32', () => {
  it('matches the IEEE known-answer for "123456789" (0xCBF43926)', () => {
    expect(crc32(enc.encode('123456789')) >>> 0).toBe(0xcbf43926);
  });
  it('empty input is 0', () => expect(crc32(new Uint8Array(0))).toBe(0));
});

describe('zipStore', () => {
  it('emits the local-header and EOCD signatures', () => {
    const z = zipStore([{ name: 'a.txt', data: 'hi' }]);
    expect(u32le(z, 0)).toBe(0x04034b50);            // local file header
    // EOCD is the last 22 bytes.
    expect(u32le(z, z.length - 22)).toBe(0x06054b50);
  });

  it('records entry count and STORE method (0)', () => {
    const z = zipStore([{ name: 'a', data: 'x' }, { name: 'b', data: 'y' }]);
    expect(u16le(z, z.length - 22 + 10)).toBe(2);    // total entries in EOCD
    expect(u16le(z, 8)).toBe(0);                     // compression = STORE
  });

  it('stores data uncompressed with matching sizes and CRC', () => {
    const z = zipStore([{ name: 'a.txt', data: 'hello' }]);
    expect(u32le(z, 14) >>> 0).toBe(crc32(enc.encode('hello')));
    expect(u32le(z, 18)).toBe(5); // compressed size
    expect(u32le(z, 22)).toBe(5); // uncompressed size
  });

  it('accepts Uint8Array data as-is', () => {
    const bytes = new Uint8Array([0, 1, 2, 255]);
    const z = zipStore([{ name: 'bin', data: bytes }]);
    expect(u32le(z, 18)).toBe(4);
  });

  it('UTF-8 encodes string data (multi-byte counts as bytes, not chars)', () => {
    const z = zipStore([{ name: 'u', data: '☕' }]); // 3 bytes UTF-8
    expect(u32le(z, 18)).toBe(3);
  });

  it('is deterministic (fixed DOS timestamp) — same input, identical bytes', () => {
    const a = zipStore([{ name: 'x', data: 'same' }]);
    const b = zipStore([{ name: 'x', data: 'same' }]);
    expect([...a]).toEqual([...b]);
  });
});
