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

describe('locale: a STRING code selects a shipped pack', () => {
  // THE GAP THIS CLOSES. Under runtime delivery there is no way to IMPORT a
  // pack — `import { localeEs } from 'openeditor-text'` has nothing on disk to
  // bind to, and `openeditor-text/locales/*` does not resolve. The packs were
  // compiled into the bundle but nothing could select them: four complete
  // translations, shipped and unreachable, with `locale: 'es'` silently
  // falling through to English rather than saying so.
  it('resolves a plain language code', () => {
    expect(resolveLocale('es').bold).toBe(es.bold);
    expect(resolveLocale('fr').bold).toBe(fr.bold);
    expect(resolveLocale('de').bold).toBe(de.bold);
    expect(resolveLocale('ar').bold).toBe(ar.bold);
  });

  it('honours a region suffix by its base language', () => {
    // navigator.language hands integrators region-tagged values; matching only
    // exact codes would silently give 'es-MX' users English.
    expect(resolveLocale('es-MX').bold).toBe(es.bold);
    expect(resolveLocale('fr_CA').bold).toBe(fr.bold);
    expect(resolveLocale('AR').bold).toBe(ar.bold);
  });

  it('still covers the FULL key set, not just the keys the pack defines', () => {
    // Merged over EN, so a pack missing a key cannot leave it undefined.
    const resolved = resolveLocale('es');
    for (const k of EN_KEYS) expect(typeof resolved[k]).toBe('string');
  });

  it('degrades to English for anything unknown — never throws', () => {
    for (const bad of ['zz', 'klingon', '', '   ', null, undefined, 42, [], true]) {
      expect(() => resolveLocale(bad)).not.toThrow();
      expect(resolveLocale(bad).bold).toBe(EN_LOCALE.bold);
    }
  });

  it('an object map still wins, and still merges over EN', () => {
    const custom = resolveLocale({ bold: 'Gras' });
    expect(custom.bold).toBe('Gras');
    expect(custom.italic).toBe(EN_LOCALE.italic);
  });
});
