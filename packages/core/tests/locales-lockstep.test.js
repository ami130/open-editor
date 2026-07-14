/**
 * 17.11 — LOCALE PACK LOCKSTEP. Every shipped locale must cover EXACTLY the
 * EN_LOCALE key set: a key added to EN without translations fails here (no
 * silent English leaks into translated UIs), and a stale/typo'd key in a pack
 * fails too. Also sanity-checks value quality (non-empty strings, and packs
 * actually differ from EN so an accidental copy-paste of the EN bundle is
 * caught).
 */
import { describe, it, expect } from 'vitest';
import { EN_LOCALE, resolveLocale, t } from '../src/ui/toolbar/locale.js';
import { es } from '../src/locales/es.js';
import { fr } from '../src/locales/fr.js';
import { de } from '../src/locales/de.js';
import { ar } from '../src/locales/ar.js';

const PACKS = { es, fr, de, ar };
const EN_KEYS = Object.keys(EN_LOCALE).sort();

describe('17.11 — locale packs stay in lockstep with EN_LOCALE', () => {
  for (const [name, pack] of Object.entries(PACKS)) {
    it(`"${name}" covers exactly the EN key set`, () => {
      expect(Object.keys(pack).sort()).toEqual(EN_KEYS);
    });

    it(`"${name}" has no empty or non-string values`, () => {
      for (const [k, v] of Object.entries(pack)) {
        expect(typeof v, `${name}.${k}`).toBe('string');
        expect(v.trim().length, `${name}.${k}`).toBeGreaterThan(0);
      }
    });

    it(`"${name}" is actually translated (differs from EN for most keys)`, () => {
      const same = EN_KEYS.filter((k) => pack[k] === EN_LOCALE[k]);
      // Some identity is legitimate (Emoji, Ln, Col, format names with latin
      // examples) — but a mostly-identical pack means a copy-paste accident.
      expect(same.length, `identical keys: ${same.join(', ')}`).toBeLessThan(EN_KEYS.length / 4);
    });
  }

  it('resolveLocale merges a pack over EN with no undefined lookups', () => {
    const bundle = resolveLocale(es);
    for (const k of EN_KEYS) {
      expect(t(bundle, k), k).toBeTruthy();
    }
  });
});
